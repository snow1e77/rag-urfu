const fileUpload = document.getElementById('file-upload');
const questionInput = document.getElementById('question-input');
const chatForm = document.getElementById('chat-form');
const messagesContainer = document.getElementById('messages-container');
const statusIndicator = document.getElementById('status-indicator');
const sendBtn = document.getElementById('send-btn');
const historyList = document.getElementById('history-list');
const newChatBtn = document.getElementById('new-chat-btn');
const dragOverlay = document.getElementById('drag-overlay');
const attachedFilesContainer = document.getElementById('attached-files');

let chats = JSON.parse(localStorage.getItem('nexus_chats')) || {};
let currentChatId = localStorage.getItem('nexus_current_chat') || null;

// Initialize
function init() {
    if (typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true });
    }
    renderHistory();
    if (!currentChatId || !chats[currentChatId]) {
        startNewChat();
    } else {
        loadChat(currentChatId);
    }
}

function startNewChat() {
    currentChatId = Date.now().toString();
    chats[currentChatId] = {
        title: "Новый диалог",
        files: [],
        messages: [{
            role: 'bot',
            text: 'Привет! Я Falal, ваш умный ИИ-помощник. Загрузите PDF-документ (кнопка 🖇️ внизу или перетащите файл в окно), и я смогу отвечать на вопросы по его содержимому.'
        }]
    };
    saveChats();
    renderHistory();
    loadChat(currentChatId);
}

function saveChats() {
    localStorage.setItem('nexus_chats', JSON.stringify(chats));
    localStorage.setItem('nexus_current_chat', currentChatId);
}

function renderHistory() {
    historyList.innerHTML = '';
    const sortedIds = Object.keys(chats).sort((a, b) => b - a);
    sortedIds.forEach(id => {
        const div = document.createElement('div');
        div.className = `history-item ${id === currentChatId ? 'active' : ''}`;
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'history-item-title';
        titleSpan.innerText = chats[id].title;
        titleSpan.title = chats[id].title;
        titleSpan.onclick = () => {
            currentChatId = id;
            saveChats();
            renderHistory();
            loadChat(currentChatId);
        };
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'history-item-actions';
        
        const editBtn = document.createElement('i');
        editBtn.className = 'fa-solid fa-pen action-icon';
        editBtn.title = 'Переименовать';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            const newTitle = prompt("Введите новое название для чата:", chats[id].title);
            if (newTitle && newTitle.trim() !== "") {
                chats[id].title = newTitle.trim();
                saveChats();
                renderHistory();
            }
        };
        
        const deleteBtn = document.createElement('i');
        deleteBtn.className = 'fa-solid fa-trash action-icon delete';
        deleteBtn.title = 'Удалить';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm('Вы уверены, что хотите удалить этот чат?')) {
                delete chats[id];
                if (currentChatId === id) currentChatId = null;
                saveChats();
                if (!currentChatId || Object.keys(chats).length === 0) startNewChat();
                else { renderHistory(); loadChat(currentChatId); }
            }
        };
        
        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(deleteBtn);
        div.appendChild(titleSpan);
        div.appendChild(actionsDiv);
        historyList.appendChild(div);
    });
}

function loadChat(id) {
    messagesContainer.innerHTML = '';
    const chat = chats[id];
    if(chat) {
        if(!chat.files) chat.files = []; // backward compatibility
        chat.messages.forEach(msg => {
            renderMessageToDOM(msg.role, msg.text, false);
        });
        renderAttachedFiles();
    }
}

function renderAttachedFiles() {
    attachedFilesContainer.innerHTML = '';
    const files = chats[currentChatId].files || [];
    
    files.forEach(filename => {
        const tag = document.createElement('div');
        tag.className = 'file-tag';
        tag.innerHTML = `
            <i class="fa-solid fa-file-pdf"></i>
            <span>${filename}</span>
            <i class="fa-solid fa-xmark remove-file" title="Удалить файл из контекста"></i>
        `;
        tag.querySelector('.remove-file').onclick = async () => {
            if(confirm(`Удалить файл ${filename} из этого чата?`)) {
                try {
                    await fetch(`/files/${currentChatId}/${encodeURIComponent(filename)}`, { method: 'DELETE' });
                    chats[currentChatId].files = chats[currentChatId].files.filter(f => f !== filename);
                    saveChats();
                    renderAttachedFiles();
                } catch(e) {
                    alert('Ошибка при удалении файла: ' + e);
                }
            }
        };
        attachedFilesContainer.appendChild(tag);
    });
}

newChatBtn.addEventListener('click', startNewChat);

// Handle input resizing and buttons
questionInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    if(this.value.trim() !== '') {
        sendBtn.disabled = false; sendBtn.style.color = 'var(--text-primary)';
    } else {
        sendBtn.disabled = true; sendBtn.style.color = 'var(--text-secondary)';
    }
});

questionInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if(this.value.trim() !== '') chatForm.dispatchEvent(new Event('submit'));
    }
});

// Upload Logic
async function handleFileUpload(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        appendMessageAndSave('bot', 'Пожалуйста, выберите файл в формате PDF.');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('chat_id', currentChatId); // Send Chat ID!

    statusIndicator.innerHTML = '<i class="fa-solid fa-spinner" style="color: var(--accent-color)"></i> Загрузка PDF...';
    fileUpload.disabled = true;

    try {
        const response = await fetch('/upload', { method: 'POST', body: formData });
        const data = await response.json();
        
        if (response.ok) {
            appendMessageAndSave('bot', `✅ ${data.message}`);
            if(!chats[currentChatId].files) chats[currentChatId].files = [];
            
            // Manage UI attached files list
            if(!chats[currentChatId].files.includes(data.file_name)) {
                chats[currentChatId].files.push(data.file_name);
            }
            saveChats();
            renderAttachedFiles();
        } else {
            appendMessageAndSave('bot', `❌ Ошибка: ${data.detail || 'Не удалось загрузить файл.'}`);
        }
    } catch (error) {
        appendMessageAndSave('bot', `❌ Ошибка сети: ${error.message}`);
    } finally {
        statusIndicator.innerText = 'Готов к работе';
        fileUpload.disabled = false;
        fileUpload.value = '';
    }
}

fileUpload.addEventListener('change', (e) => { handleFileUpload(e.target.files[0]); });

let dragCounter = 0;
document.body.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; dragOverlay.style.display = 'flex'; });
document.body.addEventListener('dragleave', (e) => { e.preventDefault(); dragCounter--; if (dragCounter === 0) dragOverlay.style.display = 'none'; });
document.body.addEventListener('dragover', (e) => { e.preventDefault(); });
document.body.addEventListener('drop', (e) => {
    e.preventDefault(); dragCounter = 0; dragOverlay.style.display = 'none';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]);
});

// Chat submit handler
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = questionInput.value.trim();
    if (!question) return;

    if (chats[currentChatId].title === "Новый диалог") {
        chats[currentChatId].title = question.substring(0, 25) + (question.length > 25 ? '...' : '');
        renderHistory();
    }

    appendMessageAndSave('user', question);
    questionInput.value = '';
    questionInput.style.height = 'auto';
    sendBtn.disabled = true;
    sendBtn.style.color = 'var(--text-secondary)';

    const botMessageElement = renderMessageToDOM('bot', '<i class="fa-solid fa-spinner"></i> Генерирую ответ...');

    try {
        const response = await fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, chat_id: currentChatId }) // Send Chat ID
        });

        const data = await response.json();

        if (response.ok) {
            let answerText = data.answer;
            botMessageElement.querySelector('.text').innerHTML = typeof marked !== 'undefined' ? marked.parse(answerText) : answerText.replace(/\n/g, '<br>');
            chats[currentChatId].messages.push({role: 'bot', text: answerText});
            saveChats();
        } else {
            botMessageElement.querySelector('.text').innerText = `Ошибка: ${data.detail}`;
            chats[currentChatId].messages.push({role: 'bot', text: `Ошибка: ${data.detail}`});
            saveChats();
        }
    } catch (error) {
        botMessageElement.querySelector('.text').innerText = `Системная ошибка: ${error.message}`;
        chats[currentChatId].messages.push({role: 'bot', text: `Системная ошибка: ${error.message}`});
        saveChats();
    }
});

function appendMessageAndSave(role, text) {
    if(!chats[currentChatId]) return;
    chats[currentChatId].messages.push({role, text});
    saveChats();
    renderMessageToDOM(role, text);
}

function renderMessageToDOM(role, text, isHtml = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    const icon = role === 'user' ? 'fa-user' : 'fa-robot';
    
    let contentHTML = text;
    if (!isHtml) {
        if (role === 'bot' && typeof marked !== 'undefined' && text.indexOf('<i class="fa-solid fa-spinner">') === -1 && !text.startsWith('✅') && !text.startsWith('❌')) {
            contentHTML = marked.parse(text);
        } else if (text.indexOf('<i class="fa-solid fa-spinner">') === -1) {
             contentHTML = text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br>');
        }
    }
    
    messageDiv.innerHTML = `<div class="avatar"><i class="fa-solid ${icon}"></i></div><div class="text">${contentHTML}</div>`;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return messageDiv;
}

init();
