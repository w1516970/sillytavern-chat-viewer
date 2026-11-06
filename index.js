const context = SillyTavern.getContext();
const EXTENSION_ID = 'st_chat_viewer';
const WAND_CONTAINER_ID = `${EXTENSION_ID}_wand_container`;
const MODAL_ID = `${EXTENSION_ID}_modal`;
// 酒馆助手（TavernHelper / JS-slash-runner）美化内容的约定：消息正文里的 <body> 块
const HELPER_BODY_RE = /<body[^>]*>([\s\S]*?)<\/body>/i;

let modal;
let list;
let outline;
let range;
let percentInput;
let status;
let modeLabel;
let modeInputs = {};
let lastChatSignature = '';

const MODE_STORAGE_KEYS = {
    text: `${EXTENSION_ID}:text-only`,
    html: `${EXTENSION_ID}:html-enabled`,
    helper: `${EXTENSION_ID}:helper-enabled`,
};

const THEME_STORAGE_KEY = `${EXTENSION_ID}:theme`;
const THEMES = [
    { id: 'tavern', name: '跟随酒馆' },
    { id: 'midnight', name: '深空蓝' },
    { id: 'aurora', name: '极光' },
    { id: 'sakura', name: '樱粉' },
    { id: 'sunset', name: '落日' },
    { id: 'paper', name: '纸墨' },
];
// 各主题对应的魔法棒入口按钮颜色；tavern 主题运行时读取酒馆主题色
const THEME_WAND_COLORS = {
    tavern: '#a78bfa',
    midnight: '#7c9cff',
    aurora: '#43e5a0',
    sakura: '#e0568c',
    sunset: '#ff9e64',
    paper: '#8a6d3b',
};

const modes = {
    text: localStorage.getItem(MODE_STORAGE_KEYS.text) === 'true',
    html: localStorage.getItem(MODE_STORAGE_KEYS.html) === 'true',
    helper: localStorage.getItem(MODE_STORAGE_KEYS.helper) === 'true',
};

let theme = localStorage.getItem(THEME_STORAGE_KEY) || 'midnight';
if (!THEME_WAND_COLORS[theme]) theme = 'midnight';

function escapeText(value) {
    return value == null ? '' : String(value);
}

function getMessages() {
    const chat = Array.isArray(context.chat) ? context.chat : [];
    return chat.filter(message => message && typeof message === 'object');
}

function getSpeaker(message) {
    if (message.is_user) return '我';
    if (message.is_system) return '系统';
    return escapeText(message.name || '角色');
}

function getMessageRaw(message) {
    return escapeText(message.mes ?? message.message ?? '').trim();
}

function extractPlainText(raw, fallback = '') {
    const template = document.createElement('template');
    template.innerHTML = escapeText(raw);
    // 去掉脚本、样式和酒馆助手美化块，只保留正文文本
    template.content.querySelectorAll('script,style,body,iframe,object,embed,template,link,meta')
        .forEach(node => node.remove());
    template.content.querySelectorAll('br').forEach(node => node.replaceWith(document.createTextNode('\n')));
    template.content.querySelectorAll('p,div,section,article,li,tr,h1,h2,h3,h4,h5,h6,blockquote,pre,hr')
        .forEach(node => node.append('\n'));
    const plain = (template.content.textContent || '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return plain || fallback;
}

function sanitizeHtml(value) {
    const html = escapeText(value);
    const purifier = SillyTavern.libs?.DOMPurify;
    if (purifier) {
        return purifier.sanitize(html, {
            USE_PROFILES: { html: true },
            ADD_ATTR: ['target', 'rel'],
            FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
        });
    }

    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('script,style,iframe,object,embed,form,link,meta').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => {
        [...node.attributes].forEach(attribute => {
            if (attribute.name.toLowerCase().startsWith('on')) node.removeAttribute(attribute.name);
        });
    });
    return template.innerHTML;
}

function buildHelperFrame(raw) {
    const match = raw.match(HELPER_BODY_RE);
    const frame = document.createElement('iframe');
    frame.className = 'st-chat-viewer-helper-frame';
    // 不授予 allow-scripts：美化排版正常显示，但其中的脚本一律不执行
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('loading', 'lazy');
    frame.title = '酒馆助手美化内容';
    frame.addEventListener('load', () => {
        try {
            const doc = frame.contentDocument;
            const height = doc?.documentElement?.scrollHeight || 0;
            frame.style.height = `${Math.max(60, Math.min(height + 16, 4000))}px`;
        } catch (error) {
            frame.style.height = '320px';
        }
    });
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>`
        + `body{margin:0;padding:12px;background:#fff;color:#1f2430;font-family:inherit;overflow-wrap:anywhere;}`
        + `img{max-width:100%;height:auto;}table{border-collapse:collapse;}td,th{border:1px solid #ccc;padding:4px 8px;}`
        + `</style></head><body>${match ? match[1] : ''}</body></html>`;
    return frame;
}

function createButton(parent, label, icon, handler, extraClass = '') {
    const button = document.createElement('div');
    button.className = `menu_button interactable ${extraClass}`.trim();
    button.tabIndex = 0;
    button.title = label;
    button.innerHTML = `<i class="fa-solid ${icon} fa-fw"></i><span>${label}</span>`;
    button.addEventListener('click', handler);
    button.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handler();
        }
    });
    parent.appendChild(button);
    return button;
}

function ensureWandButton() {
    let container = document.getElementById(WAND_CONTAINER_ID);
    if (!container) {
        const menu = document.getElementById('extensionsMenu');
        if (!menu) return;
        container = document.createElement('div');
        container.id = WAND_CONTAINER_ID;
        container.className = 'extension_container';
        menu.appendChild(container);
    }
    if (!container.querySelector(`.${EXTENSION_ID}_open_button`)) {
        createButton(container, '独立查看聊天记录', 'fa-book-open', openViewer, `${EXTENSION_ID}_open_button`);
    }
    applyTheme();
}

function applyTheme() {
    if (modal) {
        THEMES.forEach(({ id }) => modal.classList.remove(`theme-${id}`));
        modal.classList.add(`theme-${theme}`);
    }
    // 魔法棒入口按钮颜色跟随主题；跟随酒馆模式实时读取酒馆主题色
    let wandColor = THEME_WAND_COLORS[theme];
    if (theme === 'tavern') {
        const tavernColor = (getComputedStyle(document.documentElement)
            .getPropertyValue('--SmartThemeQuoteColor') || '').trim();
        if (tavernColor) wandColor = tavernColor;
    }
    const container = document.getElementById(WAND_CONTAINER_ID);
    if (container) container.style.setProperty('--viewer-wand-color', wandColor);
    modal?.querySelectorAll('.st-chat-viewer-theme-dot').forEach(dot => {
        dot.classList.toggle('is-active', dot.dataset.theme === theme);
    });
}

function buildThemeDots(parent) {
    const label = document.createElement('span');
    label.className = 'st-chat-viewer-modes-label';
    label.textContent = '主题';
    const wrap = document.createElement('span');
    wrap.className = 'st-chat-viewer-themes';
    THEMES.forEach(({ id, name }) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'st-chat-viewer-theme-dot';
        dot.dataset.theme = id;
        dot.title = `主题：${name}`;
        dot.setAttribute('aria-label', `主题：${name}`);
        dot.style.setProperty('--dot-color', THEME_WAND_COLORS[id]);
        dot.addEventListener('click', () => {
            if (theme === id) return;
            theme = id;
            localStorage.setItem(THEME_STORAGE_KEY, theme);
            applyTheme();
        });
        wrap.appendChild(dot);
    });
    parent.append(label, wrap);
}

function buildModeToggle(mode, icon, title, subtitle) {
    const label = document.createElement('label');
    label.className = 'st-chat-viewer-mode-toggle';
    label.dataset.mode = mode;
    label.title = title;
    label.innerHTML = `<span class="st-chat-viewer-toggle-icon"><i class="fa-solid ${icon}"></i></span>`
        + `<span class="st-chat-viewer-toggle-copy"><b>${title}</b><small>${subtitle}</small></span>`
        + `<input type="checkbox"${modes[mode] ? ' checked' : ''}>`
        + `<span class="st-chat-viewer-switch" aria-hidden="true"></span>`;
    const input = label.querySelector('input');
    input.setAttribute('aria-label', title);
    input.addEventListener('change', () => setMode(mode, input.checked));
    return label;
}

function buildModal() {
    if (document.getElementById(MODAL_ID)) return;
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'st-chat-viewer-modal displayNone';
    modal.innerHTML = `
        <div class="st-chat-viewer-backdrop"></div>
        <section class="st-chat-viewer-window" role="dialog" aria-modal="true" aria-label="独立聊天记录查看器">
            <header class="st-chat-viewer-header">
                <div>
                    <h3>独立聊天记录</h3>
                    <div class="st-chat-viewer-meta"><span class="st-chat-viewer-status"></span><span class="st-chat-viewer-mode"></span></div>
                </div>
                <div class="st-chat-viewer-actions">
                    <button class="menu_button st-chat-viewer-top" title="回到顶部" aria-label="回到顶部"><i class="fa-solid fa-arrow-up"></i></button>
                    <button class="menu_button st-chat-viewer-close" title="关闭" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </header>
            <div class="st-chat-viewer-progress-wrap">
                <i class="fa-solid fa-location-dot"></i>
                <input class="st-chat-viewer-range" type="range" min="0" max="100" value="0" step="0.1" aria-label="聊天记录进度">
                <input class="st-chat-viewer-percent" type="number" min="0" max="100" step="0.1" value="0" aria-label="聊天记录百分比">
                <span>%</span>
            </div>
            <div class="st-chat-viewer-modes">
                <span class="st-chat-viewer-modes-label">显示模式</span>
            </div>
            <div class="st-chat-viewer-body">
                <aside class="st-chat-viewer-outline" aria-label="楼层目录"></aside>
                <main class="st-chat-viewer-list" tabindex="0"></main>
            </div>
        </section>`;
    document.body.appendChild(modal);
    list = modal.querySelector('.st-chat-viewer-list');
    outline = modal.querySelector('.st-chat-viewer-outline');
    range = modal.querySelector('.st-chat-viewer-range');
    percentInput = modal.querySelector('.st-chat-viewer-percent');
    status = modal.querySelector('.st-chat-viewer-status');
    modeLabel = modal.querySelector('.st-chat-viewer-mode');
    modeInputs = {};

    const modesRow = modal.querySelector('.st-chat-viewer-modes');
    modesRow.appendChild(buildModeToggle('text', 'fa-align-left', '只看正文', '屏蔽 HTML 与美化内容'));
    modesRow.appendChild(buildModeToggle('html', 'fa-code', 'HTML 渲染', '安全渲染网页排版'));
    modesRow.appendChild(buildModeToggle('helper', 'fa-wand-magic-sparkles', '酒馆助手美化', '渲染 <body> 美化块'));
    buildThemeDots(modesRow);
    applyTheme();

    modal.querySelector('.st-chat-viewer-backdrop').addEventListener('click', closeViewer);
    modal.querySelector('.st-chat-viewer-close').addEventListener('click', closeViewer);
    modal.querySelector('.st-chat-viewer-top').addEventListener('click', () => scrollToPercent(0));
    range.addEventListener('input', () => scrollToPercent(Number(range.value)));
    percentInput.addEventListener('change', () => {
        const value = Math.max(0, Math.min(100, Number(percentInput.value) || 0));
        scrollToPercent(value);
    });
    list.addEventListener('scroll', updateProgressFromScroll, { passive: true });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal && !modal.classList.contains('displayNone')) closeViewer();
    });
    updateModeLabel();
}

function setMode(changed, value) {
    if (changed === 'text' && value) {
        // 只看正文开启时，其余两个模式自动关闭
        modes.html = false;
        modes.helper = false;
    }
    if ((changed === 'html' || changed === 'helper') && value) {
        modes.text = false;
    }
    Object.entries(MODE_STORAGE_KEYS).forEach(([key, storageKey]) => {
        localStorage.setItem(storageKey, String(modes[key]));
    });
    Object.entries(modeInputs).forEach(([key, input]) => {
        if (input) input.checked = modes[key];
    });
    updateModeLabel();
    renderViewer();
}

function updateModeLabel() {
    if (!modeLabel) return;
    let label = '纯文本模式';
    if (modes.text) {
        label = '只看正文';
    } else {
        const active = [];
        if (modes.html) active.push('HTML');
        if (modes.helper) active.push('酒馆助手美化');
        label = active.length ? `正在渲染：${active.join(' + ')}` : '纯文本模式';
    }
    modeLabel.textContent = label;
    modeLabel.classList.toggle('is-active', modes.text || modes.html || modes.helper);
}

function renderViewer() {
    if (!modal) buildModal();
    const messages = getMessages();
    list.replaceChildren();
    outline.replaceChildren();
    lastChatSignature = `${messages.length}:${messages.at(-1)?.mes || ''}`;
    status.textContent = `${messages.length} 楼 · 仅显示当前对话原始消息`;

    if (!messages.length) {
        const empty = document.createElement('div');
        empty.className = 'st-chat-viewer-empty';
        empty.textContent = '当前没有可显示的聊天记录。';
        list.appendChild(empty);
        range.value = percentInput.value = '0';
        return;
    }

    messages.forEach((message, index) => {
        const floor = index + 1;
        const raw = getMessageRaw(message);
        const hasHelper = HELPER_BODY_RE.test(raw);
        const card = document.createElement('article');
        card.className = `st-chat-viewer-message ${message.is_user ? 'is-user' : 'is-character'}`;
        card.id = `${EXTENSION_ID}_floor_${index}`;
        card.dataset.floor = String(floor);
        const head = document.createElement('div');
        head.className = 'st-chat-viewer-message-head';
        const speaker = document.createElement('strong');
        speaker.textContent = getSpeaker(message);
        const floorLabel = document.createElement('span');
        floorLabel.textContent = `第 ${floor} 楼`;
        const date = document.createElement('time');
        if (message.send_date) date.textContent = escapeText(message.send_date);
        head.append(speaker, floorLabel, date);
        const content = document.createElement('div');
        content.className = 'st-chat-viewer-message-content';

        if (modes.text) {
            content.classList.add('is-plain');
            content.textContent = extractPlainText(raw, hasHelper ? '（该楼为酒馆助手美化楼层，无纯文本正文）' : '（空消息）');
        } else if (modes.helper && hasHelper) {
            content.classList.add('is-helper');
            content.appendChild(buildHelperFrame(raw));
        } else if (modes.html && raw) {
            content.classList.add('is-html');
            content.innerHTML = sanitizeHtml(raw);
        } else {
            content.textContent = raw || '（空消息）';
        }
        card.append(head, content);
        list.appendChild(card);

        const previewSource = hasHelper ? extractPlainText(raw, '') : raw;
        const previewText = hasHelper && !previewSource ? '（酒馆助手美化楼层）' : previewSource;
        const item = document.createElement('button');
        item.className = 'st-chat-viewer-outline-item';
        item.type = 'button';
        item.innerHTML = `<span class="floor">${floor}</span><span class="outline-text"></span>`;
        item.querySelector('.outline-text').textContent = `${getSpeaker(message)}：${previewText.replace(/\s+/g, ' ').slice(0, 80) || '（空消息）'}`;
        item.addEventListener('click', () => {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            card.classList.add('is-highlighted');
            window.setTimeout(() => card.classList.remove('is-highlighted'), 900);
        });
        outline.appendChild(item);
    });
    updateProgressFromScroll();
}

function scrollToPercent(value) {
    if (!list) return;
    const max = list.scrollHeight - list.clientHeight;
    const safe = Math.max(0, Math.min(100, Number(value) || 0));
    list.scrollTop = max > 0 ? max * safe / 100 : 0;
    range.value = percentInput.value = safe.toFixed(1).replace(/\.0$/, '');
}

function updateProgressFromScroll() {
    if (!list || !range || !percentInput) return;
    const max = list.scrollHeight - list.clientHeight;
    const value = max > 0 ? (list.scrollTop / max) * 100 : 0;
    range.value = percentInput.value = value.toFixed(1).replace(/\.0$/, '');
}

function openViewer() {
    buildModal();
    renderViewer();
    modal.classList.remove('displayNone');
    document.body.classList.add('st-chat-viewer-open');
    window.setTimeout(() => list?.focus(), 0);
}

function closeViewer() {
    modal?.classList.add('displayNone');
    document.body.classList.remove('st-chat-viewer-open');
}

function refreshIfOpen() {
    ensureWandButton();
    if (!modal || modal.classList.contains('displayNone')) return;
    const messages = getMessages();
    const signature = `${messages.length}:${messages.at(-1)?.mes || ''}`;
    if (signature !== lastChatSignature) renderViewer();
}

function init() {
    buildModal();
    ensureWandButton();
    const { eventSource, event_types } = context;
    [event_types.APP_READY, event_types.CHAT_CHANGED, event_types.MESSAGE_SENT, event_types.MESSAGE_RECEIVED,
        event_types.MESSAGE_EDITED, event_types.MESSAGE_DELETED, event_types.MESSAGE_SWIPED].filter(Boolean)
        .forEach(type => eventSource.on(type, refreshIfOpen));
    window.setInterval(ensureWandButton, 2500);
}

init();
