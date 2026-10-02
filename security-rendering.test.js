'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const chat = fs.readFileSync(path.join(__dirname, 'chat.html'), 'utf8');
const auth = fs.readFileSync(path.join(__dirname, 'auth-api.js'), 'utf8');
function fn(source, name) {
    const start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name);
    const end = source.indexOf('\n}\n', start);
    return source.slice(start, end + 2);
}
function environment() {
    const elements = new Map(), created = [];
    class Element {
        constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.value = ''; created.push(this); }
        set innerHTML(_) { throw new Error('Une donnée dynamique ne doit pas passer par innerHTML'); }
        set textContent(value) { this.value = String(value); this.children = []; }
        get textContent() { return this.value + this.children.map(c => c.textContent).join(''); }
        append(...nodes) { this.children.push(...nodes); }
        appendChild(node) { this.children.push(node); }
        replaceChildren(...nodes) { this.value = ''; this.children = nodes; }
        addEventListener() {}
        remove() {}
    }
    const document = {
        body: new Element('body'),
        createElement: tag => new Element(tag),
        getElementById: id => { if (!elements.has(id)) elements.set(id, new Element('div')); return elements.get(id); }
    };
    const handlers = {};
    const socket = { on(event, handler) { handlers[event] = handler; }, emit() {} };
    const context = vm.createContext({ document, window: {}, console, setTimeout() {}, clearTimeout() {}, io: () => socket,
        getToken: () => 'fixture', scrollToBottom() {}, gifts: [], selectGift() {} });
    return { context, document, elements, created, handlers };
}

test('Cadeaux, animation et catalogue traitent les balises comme du texte', () => {
    const e = environment();
    const payload = '<img src=x onerror="globalThis.compromised=true">';
    vm.runInContext(['safeGiftColor', 'animateGift', 'renderGifts', 'initSocket'].map(name => fn(chat, name)).join('\n'), e.context);
    vm.runInContext('initSocket()', e.context);
    e.handlers.gift({ username: payload, gift: payload, giftName: payload, receiver: payload, color: payload });
    assert.ok(e.document.getElementById('chatMessages').textContent.includes(payload));
    assert.ok(e.document.body.textContent.includes(payload));
    assert.ok(!e.created.some(el => el.tagName === 'img' || el.tagName === 'script'));
    e.context.gifts = [{ id: 1, name: payload, emoji: payload, price: 10 }];
    vm.runInContext('renderGifts()', e.context);
    assert.ok(e.document.getElementById('giftsGrid').textContent.includes(payload));
    assert.equal(e.context.compromised, undefined);
});

test('Notifications : le contenu des erreurs reste du texte', () => {
    const e = environment();
    vm.runInContext(fn(auth, 'showToast'), e.context);
    const payload = '<svg onload="globalThis.compromised=true">';
    e.context.showToast(payload, 'error');
    assert.ok(e.document.getElementById('evisio-toast').textContent.includes(payload));
    assert.equal(e.context.compromised, undefined);
});

test('Le navigateur ne publie plus lui-même les cadeaux', () => {
    assert.ok(!chat.includes("socket.emit('gift'"));
    for (const match of chat.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
        new vm.Script(match[1]);
    }
});
