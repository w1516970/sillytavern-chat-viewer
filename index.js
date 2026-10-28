const context = SillyTavern.getContext();
const EXTENSION_ID = 'st_chat_viewer';
const WAND_CONTAINER_ID = `${EXTENSION_ID}_wand_container`;
const MODAL_ID = `${EXTENSION_ID}_modal`;

let modal;
let list;
let outline;
let range;
let percentInput;
let status;
let htmlToggle;
let lastChatSignature = '';
let htmlEnabled = localStorage.getItem(`${EXTENSION_ID}:html-enabled`) === 'true';

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

function getMessageText(message) {
    return escapeText(message.mes ?? message.message ?? '').trim();
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

    const settings = document.getElementById('extensions_settings');
    if (settings && !settings.querySelector(`.${EXTENSION_ID}_settings_button`)) {
        const wrapper = document.createElement('div');
        wrapper.className = 'inline-drawer';
        const header = document.createElement('div');
        header.className = 'inline-drawer-toggle inline-drawer-header';
        header.innerHTML = '<b>独立聊天记录查看器</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>';
        const content = document.createElement('div');
        content.className = 'inline-drawer-content';
        createButton(content, '打开当前聊天记录', 'fa-book-open', openViewer, `${EXTENSION_ID}_settings_button`);
        const hint = document.createElement('small');
        hint.textContent = '也可以从输入框右侧的魔法棒菜单打开。';
        content.appendChild(hint);
        wrapper.append(header, content);
        settings.appendChild(wrapper);
    }
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
                    <span class="st-chat-viewer-status"></span>
                </div>
                <div class="st-chat-viewer-actions">
                    <button class="menu_button st-chat-viewer-top" title="回到顶部"><i class="fa-solid fa-arrow-up"></i></button>
                    <button class="menu_button st-chat-viewer-close" title="关闭"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </header>
            <div class="st-chat-viewer-progress-wrap">
                <i class="fa-solid fa-location-dot"></i>
                <input class="st-chat-viewer-range" type="range" min="0" max="100" value="0" step="0.1" aria-label="聊天记录进度">
                <input class="st-chat-viewer-percent" type="number" min="0" max="100" step="0.1" value="0" aria-label="聊天记录百分比">
                <span>%</span>
                <label class="st-chat-viewer-html-toggle" title="开启后在查看器内渲染消息中的安全 HTML">
                    <input type="checkbox" aria-label="HTML 渲染" ${htmlEnabled ? 'checked' : ''}>
                    <span>HTML 渲染</span>
                </label>
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
    htmlToggle = modal.querySelector('.st-chat-viewer-html-toggle input');

    modal.querySelector('.st-chat-viewer-backdrop').addEventListener('click', closeViewer);
    modal.querySelector('.st-chat-viewer-close').addEventListener('click', closeViewer);
    modal.querySelector('.st-chat-viewer-top').addEventListener('click', () => scrollToPercent(0));
    range.addEventListener('input', () => scrollToPercent(Number(range.value)));
    percentInput.addEventListener('change', () => {
        const value = Math.max(0, Math.min(100, Number(percentInput.value) || 0));
        scrollToPercent(value);
    });
    htmlToggle.addEventListener('change', () => {
        htmlEnabled = htmlToggle.checked;
        localStorage.setItem(`${EXTENSION_ID}:html-enabled`, String(htmlEnabled));
        renderViewer();
    });
    list.addEventListener('scroll', updateProgressFromScroll, { passive: true });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal && !modal.classList.contains('displayNone')) closeViewer();
    });
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
        const text = getMessageText(message);
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
        if (htmlEnabled && text) {
            content.classList.add('is-html');
            content.innerHTML = sanitizeHtml(text);
        } else {
            content.textContent = text || '（空消息）';
        }
        card.append(head, content);
        list.appendChild(card);

        const item = document.createElement('button');
        item.className = 'st-chat-viewer-outline-item';
        item.type = 'button';
        item.innerHTML = `<span class="floor">${floor}</span><span class="outline-text"></span>`;
        item.querySelector('.outline-text').textContent = `${getSpeaker(message)}：${text.replace(/\s+/g, ' ').slice(0, 80) || '（空消息）'}`;
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
