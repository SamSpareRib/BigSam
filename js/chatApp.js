// js/chatApp.js

// 从 firebase-init.js 导入 auth 实例 和 db 实例
import { auth, db, app } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 新增：从 Firestore SDK 导入函数
import { limit, collection, getDocs, query, orderBy, where, doc, setDoc, getDoc, serverTimestamp, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
console.log("chatApp.js loaded");

// 新增：从 Firebase SDK 导入 Functions 相关函数
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// --- DOM 元素获取 ---
// (已有的 DOM 元素获取代码保持不变)
const profileCircleIcon = document.getElementById('profile-circle-icon');
const profileDropdownMenu = document.getElementById('profile-dropdown-menu');
const profileUserEmail = document.getElementById('profile-user-email');
const logoutButton = document.getElementById('chat-logout-button');
const profileUserName = document.getElementById('profile-user-name');

const completeTaskButton = document.getElementById('complete-task-button');
const taskListArea = document.getElementById('task-list-area');
const tasksUl = document.getElementById('tasks-ul'); // 获取 ul 元素
const taskListMessage = document.getElementById('task-list-message'); // 获取提示信息 p 元素
const eportfolioDashboardArea = document.getElementById('eportfolio-dashboard-area');
const chatInterface = document.getElementById('chat-interface');
const backToTasksButton = document.getElementById('back-to-tasks-button');
const userInput = document.getElementById('user-input'); // 获取输入框
const sendButton = document.getElementById('send-button'); // 获取发送按钮
const chatbox = document.getElementById('chatbox'); // 获取聊天框
const chatHeaderTitle = document.getElementById('chat-header-title');
const viewEportfolioTextButton = document.getElementById('view-eportfolio-text-button');
const textDisplayModal = document.getElementById('text-display-modal');
const modalTitle = document.getElementById('modal-title');
const modalTextContent = document.getElementById('modal-text-content');
const closeTextModalButton = document.getElementById('close-text-modal-button');

// (已有的右上角用户信息区逻辑和退出登录逻辑保持不变)


// --- 全局变量，用于存储当前激活的任务和提交信息 ---
let activeTask = null;         // 存储当前任务的完整数据 (从 /tasks 读取)
let activeSubmission = null;   // 存储当前任务提交的完整数据 (从 /taskSubmissions 读取或创建)
let currentUser = null;        // 存储当前登录的用户对象
// --- 新增：获取 Firebase Functions 服务实例 ---
const functions = getFunctions(app); // app 是从 firebase-init.js 导出的 Firebase App 实例

// --- 认证状态处理 ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user; // 保存当前用户对象
        console.log("chat.html: User is logged in:", user); // 确保这里有日志

        if (profileUserName) {
            profileUserName.textContent = user.displayName || "用户";
            if (profileUserEmail) profileUserEmail.textContent = user.email;
          }
        if (profileCircleIcon) { // 检查 profileCircleIcon 是否成功获取
            const displayName = user.displayName;
            let initialChar = "U"; // Default
            if (displayName) {
                const firstChar = displayName.charAt(0);
                if (/[\u4e00-\u9fa5]/.test(firstChar)) { // 简单的中文判断
                    initialChar = firstChar;
                } else {
                    initialChar = firstChar.toUpperCase();
                }
            } else if (user.email) {
              initialChar = user.email.charAt(0).toUpperCase();
            } else {
              initialChar = "A";
            }
            profileCircleIcon.textContent = initialChar;
            console.log("Set profile initial to:", initialChar); // 添加日志
        } else {
            console.error("profileCircleIcon is null, cannot set initial."); // 添加错误日志
        }
        loadTasks(currentUser.uid);
    } else {
        currentUser = null;
        window.location.href = 'index.html';
    }
});

// --- 新增：处理发送按钮点击事件的逻辑 ---
if (sendButton && userInput) {
    sendButton.addEventListener('click', handleSendMessage);
    userInput.addEventListener('keypress', function(e) { // 允许按 Enter键 发送
        if (e.key === 'Enter' && !e.shiftKey) { // Shift+Enter 用于换行
            e.preventDefault(); // 阻止默认的换行行为
            handleSendMessage();
        }
    });
}

// --- 新增：处理“完成本次任务”按钮的点击事件 ---
if (completeTaskButton) {
    completeTaskButton.addEventListener('click', async () => {
        if (!currentUser || !activeTask || !activeSubmission || !activeSubmission.id) {
            console.error("无法操作任务：用户未登录、未选择有效任务或任务提交ID无效。");
            alert("请先选择一个任务并开始进行，或确保任务已正确加载。");
            return;
        }

        if (activeSubmission.status === "in-progress") {
            if (confirm(`您确定要完成任务 "${activeTask.title}" 吗？\n将为您生成任务总结报告和更新E-Portfolio。`)) {
                await completeInProgressTaskFlow(); // 调用新的流程函数
            } else {
                console.log("用户取消了完成任务操作。");
            }
        } else if (activeSubmission.status === "completed") {
            // TODO: 步骤 4.6 - 实现 "记录本次对话以更新E-Portfolio"
            // 例如，调用一个新的函数: await updateEportfolioForCompletedTaskWithNewDialogue();
            alert("TODO: 实现记录对话以更新E-Portfolio的功能 (步骤 4.6)。");
        } else {
            alert("当前任务状态未知 (" + activeSubmission.status + ") 或无法执行此操作。");
        }
    });
  }

// --- 右上角用户信息区逻辑 ---
if (profileCircleIcon) {
    profileCircleIcon.addEventListener('click', () => {
        if (profileDropdownMenu) {
            profileDropdownMenu.style.display = profileDropdownMenu.style.display === 'block' ? 'none' : 'block';
        }
    });
}
document.addEventListener('click', function(event) {
    if (profileCircleIcon && profileDropdownMenu &&
        !profileCircleIcon.contains(event.target) &&
        !profileDropdownMenu.contains(event.target) &&
        profileDropdownMenu.style.display === 'block') {
        profileDropdownMenu.style.display = 'none';
    }
});

// --- 查看E-Portfolio文本按钮的事件监听 ---
if (viewEportfolioTextButton) {
    viewEportfolioTextButton.addEventListener('click', async () => {
        if (!currentUser || !currentUser.uid) {
            alert("请先登录后再查看E-Portfolio。");
            return;
        }
        if (!textDisplayModal || !modalTitle || !modalTextContent) {
            console.error("E-Portfolio查看：模态框元素未找到!");
            alert("无法显示E-Portfolio，界面元素缺失。");
            return;
        }

        console.log("尝试加载并显示E-Portfolio文本 for user:", currentUser.uid);
        modalTitle.textContent = "我的E-Portfolio完整报告"; // 设置模态框标题
        modalTextContent.innerHTML = '<div class="message system-message">正在加载报告内容...</div>'; // 加载提示
        textDisplayModal.style.display = 'block'; // 显示模态框

        try {
            const userDocRef = doc(db, "users", currentUser.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                if (userData && userData.ePortfolioText && typeof userData.ePortfolioText === 'string') {
                    console.log("E-Portfolio文本加载成功。");
                    // Markdown 渲染 (假设已引入 marked.js)
                    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
                         modalTextContent.innerHTML = marked.parse(userData.ePortfolioText);
                    } else {
                        // Fallback: 显示纯文本并处理换行
                        modalTextContent.textContent = userData.ePortfolioText;
                        console.warn("Marked.js (Markdown parser) not found. Displaying raw text for E-Portfolio.");
                    }
                } else {
                    modalTextContent.innerHTML = '<div class="message system-message">暂无E-Portfolio报告内容。可能是您还未完成任何任务，或者报告尚未生成。</div>';
                }
            } else {
                modalTextContent.innerHTML = '<div class="message system-message error">未找到用户数据，无法加载E-Portfolio报告。</div>';
            }
        } catch (error) {
            console.error("加载E-Portfolio文本失败:", error);
            modalTextContent.innerHTML = `<div class="message system-message error">加载报告失败：${error.message}</div>`;
        }
    });
}

// --- 关闭模态框的逻辑 ---
if (closeTextModalButton) {
    closeTextModalButton.addEventListener('click', () => {
        if (textDisplayModal) textDisplayModal.style.display = 'none';
    });
}
// 点击模态框外部也关闭 (可选)
window.addEventListener('click', (event) => {
    if (event.target === textDisplayModal) { // 如果点击的是模态框背景本身
        if (textDisplayModal) textDisplayModal.style.display = 'none';
    }
});


// --- 退出登录逻辑 ---
if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        try {
            if (profileDropdownMenu) profileDropdownMenu.style.display = 'none';
            await signOut(auth);
        } catch (error) {
            console.error("chat.html: Sign out error", error);
            alert("退出失败: " + error.message);
        }
    });
}

// --- 界面切换逻辑 ---
// --- 返回任务列表/仪表盘视图的逻辑 ---
if (backToTasksButton) {
    backToTasksButton.addEventListener('click', () => {
        console.log("返回按钮被点击。");

        // 1. 切换界面显示
        if (chatInterface) {
            chatInterface.style.display = 'none';
        }
        if (eportfolioDashboardArea) {
            // 根据您的UI设计，决定是只显示仪表盘，还是仪表盘和任务列表都显示
            // 如果任务列表在左侧边栏一直存在，则这里主要控制右侧区域
            eportfolioDashboardArea.style.display = 'block';
        }
        if (taskListArea && window.getComputedStyle(taskListArea).display === 'none') {
            // 如果之前在进入任务时隐藏了整个任务列表区域 (sidebar)，现在需要恢复它
            // 这取决于您在 handleTaskListItemClick 中如何隐藏的
            // 如果 taskListArea 是 sidebar 的一部分且 sidebar 没隐藏，则此行可能不需要
            taskListArea.style.display = 'block';
        }
        // 如果您的 sidebar (id="sidebar") 被隐藏了，也需要显示它
        const sidebar = document.getElementById('sidebar');
        if (sidebar && window.getComputedStyle(sidebar).display === 'none') {
            sidebar.style.display = 'flex'; // 或者 'block'，取决于其原始样式
        }


        // 2. (推荐) 重置当前激活的任务和提交状态
        console.log("重置 activeTask 和 activeSubmission。");
        activeTask = null;
        activeSubmission = null;
        // 这样做可以防止在未选择任务的情况下，意外地使用之前的任务信息。

        // 3. (可选) 清理聊天界面的一些状态，例如头部标题
        const chatHeaderTitle = document.getElementById('chat-header-title');
        if (chatHeaderTitle) {
            chatHeaderTitle.textContent = "任务标题"; // 或者清空，或者设为默认值
        }
        const chatbox = document.getElementById('chatbox');
        if (chatbox) {
            // chatbox.innerHTML = ''; // 是否清空上次的聊天记录，取决于产品需求
                                    // 暂时不清空，以便用户可以快速回顾上次的对话
        }
        const userInput = document.getElementById('user-input');
        if (userInput) {
            userInput.value = ''; // 清空输入框
        }


        // 4. (可选) 如果任务列表需要刷新（例如，任务状态可能已改变），可以在这里重新加载
        // if (currentUser) {
        //     loadTasks(currentUser.uid);
        // }

        console.log("已返回到任务列表/仪表盘视图。");
    });
}

// 新增或确认段位映射规则 (可以放在文件顶部或一个配置对象中)
const rankLevels = [
    { score: 0, title: "写作新手 青铜V" },
    { score: 10, title: "写作新手 青铜IV" },
    { score: 20, title: "写作新手 青铜III" },
    { score: 30, title: "写作新手 青铜II" },
    { score: 40, title: "写作新手 青铜I" },
    { score: 50, title: "进阶学徒 白银V" },
    { score: 60, title: "进阶学徒 白银IV" },
    { score: 70, title: "进阶学徒 白银III" },
    // ... 您可以定义更多段位，确保覆盖0-100分
    { score: 80, title: "写作能手 黄金V" },
    { score: 90, title: "写作高手 铂金V" },
    { score: 95, title: "写作大师 钻石V" }
];

function getRankTitle(baseScore) {
    if (baseScore === null || baseScore === undefined) return "段位未计算";
    let currentRank = rankLevels[0].title; // 默认最低段位
    for (const level of rankLevels) {
        if (baseScore >= level.score) {
            currentRank = level.title;
        } else {
            break; // 因为是升序排列，第一个不满足的就可以停止
        }
    }
    return currentRank;
}

// --- 新增：加载并显示任务列表的函数 ---
async function loadTasks(currentUserId) {
    if (!tasksUl || !taskListMessage) {
        console.error("任务列表的UL或消息元素未找到!");
        return;
    }
    tasksUl.innerHTML = '';
    taskListMessage.textContent = '正在加载任务...';
    try {
        const tasksCollectionRef = collection(db, "tasks");
        const q = query(tasksCollectionRef, orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            taskListMessage.textContent = '暂无可用任务。';
            return;
        }
        taskListMessage.textContent = '';
        querySnapshot.forEach((docSnap) => {
            const task = docSnap.data();
            const taskId = docSnap.id;
            const listItem = document.createElement('li');
            listItem.dataset.taskId = taskId;
            listItem.dataset.taskTitle = task.title;
            const titleSpan = document.createElement('span');
            titleSpan.classList.add('task-title');
            titleSpan.textContent = task.title;
            const statusSpan = document.createElement('span');
            statusSpan.classList.add('task-status');
            statusSpan.textContent = "(未开始)";
            listItem.appendChild(titleSpan);
            listItem.appendChild(statusSpan);
            listItem.addEventListener('click', () => handleTaskListItemClick(taskId, task.title));
            tasksUl.appendChild(listItem);
        });
    } catch (error) {
        console.error("加载任务列表失败:", error);
        taskListMessage.textContent = '加载任务失败，请稍后重试。';
    }
}

// --- 新增：处理任务项点击的占位函数 (将在步骤 2.4 详细实现) ---
async function handleTaskListItemClick(taskId, taskTitleFromListItem) {
    if (!currentUser) {
        console.error("用户未登录，无法处理任务点击。");
        alert("请先登录！");
        return;
    }
    console.log(`任务被点击: ID=${taskId}, 标题=${taskTitleFromListItem}`);
    if (chatbox) chatbox.innerHTML = '<div class="message system-message">正在加载任务和对话历史...</div>';

    try {
        const taskDocRef = doc(db, "tasks", taskId);
        const taskDocSnap = await getDoc(taskDocRef);
        if (taskDocSnap.exists()) {
            activeTask = { id: taskDocSnap.id, ...taskDocSnap.data() };
            console.log("获取到任务详情:", activeTask);
        } else {
            throw new Error("无法找到任务详情");
        }

        const submissionsColRef = collection(db, "taskSubmissions");
        const qLatestSubmission = query(
            submissionsColRef,
            where("userId", "==", currentUser.uid),
            where("taskId", "==", taskId),
            // orderBy("createdAt", "desc"), // 改为优先查找 in-progress
            // limit(1)
        );
        // 优先查找进行中的
        const qInProgress = query(qLatestSubmission, where("status", "==", "in-progress"), limit(1));
        let querySnapshot = await getDocs(qInProgress);

        if (querySnapshot.empty) {
            // 没有进行中的，查找最近一次完成的 (如果需要允许查看或补充对话)
            // 根据文档4.6，用户可以补充对话。所以我们加载最近的submission（无论状态）
             const qRecent = query(
                submissionsColRef,
                where("userId", "==", currentUser.uid),
                where("taskId", "==", taskId),
                orderBy("createdAt", "desc"),
                limit(1)
            );
            querySnapshot = await getDocs(qRecent);
        }


        if (!querySnapshot.empty) {
            const latestSubmissionDoc = querySnapshot.docs[0];
            activeSubmission = { id: latestSubmissionDoc.id, ...latestSubmissionDoc.data() };
            console.log("找到了最新的任务提交记录 (in-progress or completed):", activeSubmission);
            // 如果是已完成的，可能需要更新 lastUpdatedAt 或进入特定模式
            if (activeSubmission.status === "completed") {
                console.log("任务已完成，进入查看/补充对话模式。");
                // 可以在这里更新 lastUpdatedAt 如果用户开始新的交互
            }
        } else {
            const submissionDocRef = doc(collection(db, "taskSubmissions"));
            const newSubmissionData = {
                userId: currentUser.uid,
                userName: currentUser.displayName || currentUser.email,
                taskId: activeTask.id,
                taskTitle: activeTask.title,
                courseId: activeTask.courseId || "unknown_course",
                status: "in-progress",
                essaySubmitted: false,
                createdAt: serverTimestamp(),
                lastUpdatedAt: serverTimestamp()
            };
            await setDoc(submissionDocRef, newSubmissionData);
            activeSubmission = { id: submissionDocRef.id, ...newSubmissionData, createdAt: new Date(), lastUpdatedAt: new Date() };
            console.log("创建了新的任务提交记录 (in-progress):", activeSubmission);
        }

        if (!activeSubmission || !activeSubmission.id) {
            throw new Error("未能正确加载或创建任务提交记录。");
        }

        if (taskListArea) taskListArea.style.display = 'none';
        if (eportfolioDashboardArea) eportfolioDashboardArea.style.display = 'none';
        if (chatInterface) chatInterface.style.display = 'flex';
        if (chatHeaderTitle) chatHeaderTitle.textContent = activeTask.title;

        if (chatbox) chatbox.innerHTML = '';
        await loadChatHistory(activeSubmission.id);
        updateChatUIState(); // 确保在所有状态设置后更新UI

        if (userInput) userInput.focus();

    } catch (error) {
        console.error("处理任务点击或加载任务提交失败:", error);
        alert("进入任务时发生错误: " + error.message);
        if (chatbox) chatbox.innerHTML = `<div class="message system-message error">错误：${error.message}</div>`;
        activeTask = null; activeSubmission = null;
        if (chatInterface) chatInterface.style.display = 'none';
        if (eportfolioDashboardArea) eportfolioDashboardArea.style.display = 'block';
        if (taskListArea) taskListArea.style.display = 'block';
    }
}

async function loadChatHistory(submissionId) {
    if (!chatbox) return;
    if (!submissionId) {
        console.warn("loadChatHistory: submissionId is missing.");
        displayMessage(activeSubmission && activeSubmission.essaySubmitted ? "你已经提交过作文了..." : "你好！请开始你的写作...", 'system');
        return;
    }
    console.log("加载聊天历史 for submissionId:", submissionId);
    const chatsColRef = collection(db, "taskSubmissions", submissionId, "chats");
    const q = query(chatsColRef, orderBy("timestamp", "asc"), limit(100)); // 限制最近100条
    try {
        const querySnapshot = await getDocs(q);
        chatbox.innerHTML = ''; // 清空旧消息
        if (querySnapshot.empty) {
            console.log("该任务尚无聊天记录。");
            let initialMessageText = "你好！请在下方输入你的作文内容开始对话。";
            if (activeSubmission && activeSubmission.essaySubmitted) {
                initialMessageText = "你已经提交过作文了，可以直接与AI对话，或者提交修改稿。";
            }
             if (activeSubmission && activeSubmission.status === "completed") {
                initialMessageText = "您正在查看一个已完成的任务。";
            }
            displayMessage(initialMessageText, 'system');
        } else {
            querySnapshot.forEach((docSnap) => {
                const messageData = docSnap.data();
                displayMessage(
                    messageData.parts && messageData.parts[0] ? messageData.parts[0].text : "(空消息)",
                    messageData.role,
                    messageData.messageType
                );
            });
            console.log(`成功加载 ${querySnapshot.size} 条聊天记录。`);
        }
        chatbox.scrollTop = chatbox.scrollHeight;
    } catch (error) {
        console.error("加载聊天历史失败:", error);
        displayMessage("加载聊天历史失败，请稍后重试。", 'system', 'error');
    }
}

// --- 新增：调用 echoAiMessage 云函数的函数 ---
async function callAiFunction(userMessageText, taskType = "dialogue", submissionIdForTask = null) {
    // (您之前提供的 callAiFunction 代码，它已经能够处理不同的返回 role)
    // (确保它在内部构造 dataToSend 时，如果 taskType 不是 dialogue，会包含 aiTaskType 和 submissionIdForTask)
    const thinkingMessageId = `thinking-${Date.now()}`;
    displayMessage("AI 正在思考中，请稍候...", 'system', '', thinkingMessageId);

    try {
        const getAiFeedbackFunction = httpsCallable(functions, 'getAiFeedback');
        let dataToSend = { messageText: userMessageText }; // Default for dialogue

        if (taskType !== "dialogue" && submissionIdForTask) {
            dataToSend.aiTaskType = taskType;
            dataToSend.submissionId = submissionIdForTask;
        } else if (taskType !== "dialogue" && !submissionIdForTask) {
            console.error(`callAiFunction: submissionId is required for taskType '${taskType}'`);
            removeMessageById(thinkingMessageId);
            displayMessage(`错误：执行AI任务 '${taskType}' 失败，缺少提交ID。`, 'system', 'error');
            return null;
        }

        console.log(`调用云函数 getAiFeedback (taskType: ${taskType}), 发送数据:`, dataToSend);
        const result = await getAiFeedbackFunction(dataToSend);
        console.log("云函数 getAiFeedback 返回结果:", result.data);
        removeMessageById(thinkingMessageId);

        if (result.data && result.data.role === "system_generated_text" && typeof result.data.text === 'string') {
            console.log("SUCCESS: Received 'system_generated_text'.");
            // displayMessage(`[${result.data.type === "generateSingleTaskReport" ? "任务报告" : "E-Portfolio"}] 已生成。`, 'system');
            return result.data; // 返回给调用者处理 (例如 completeInProgressTaskFlow)
        } else if (result.data && result.data.role === 'model' && result.data.parts && result.data.parts.length > 0 && typeof result.data.parts[0].text === 'string') {
            console.log("INFO: Received 'model' (dialogue) response.");
            const aiResponseText = result.data.parts[0].text;
            displayMessage(aiResponseText, 'model');
            // 保存AI的model回复
            if (activeSubmission && activeSubmission.id && currentUser) {
                try {
                    const aiMessageData = {
                        role: 'model', parts: [{ text: aiResponseText }], timestamp: serverTimestamp(),
                        messageType: 'dialogue_response', userId: "AI_ASSISTANT" // 固定标识
                    };
                    const chatsColRef = collection(db, "taskSubmissions", activeSubmission.id, "chats");
                    await addDoc(chatsColRef, aiMessageData);
                    console.log("AI 'model' response saved to chats.");
                } catch (dbError) { console.error("Error saving AI 'model' response:", dbError); }
            }
            return result.data;
        } else if (result.data && result.data.role === "error" && result.data.parts && result.data.parts[0] && typeof result.data.parts[0].text === 'string') {
            console.warn("WARN: Received 'error' role from function:", result.data.parts[0].text);
            displayMessage(result.data.parts[0].text, 'system', 'error');
            return null;
        } else {
            console.error("ERROR: Fallback. Unexpected data format from cloud function:", result.data);
            displayMessage("抱歉，AI返回的数据格式无法识别或未包含预期内容。", 'system', 'error');
            return null;
        }
    } catch (error) {
        console.error("调用云函数 getAiFeedback 失败:", error);
        removeMessageById(thinkingMessageId);
        let errorMessage = "抱歉，与AI连接时发生错误。";
        if (error.code && error.message) errorMessage = `AI错误 (${error.code}): ${error.message}`;
        else if (error.message) errorMessage = `发生错误: ${error.message}`;
        displayMessage(errorMessage, 'system', 'error');
        return null;
    }
}

async function callAiFunctionInternal(payload) { // payload 应该是 {aiTaskType, submissionId, userId?, messageText?}
    if (!payload || !payload.aiTaskType || !payload.submissionId) {
        console.error("callAiFunctionInternal: Invalid payload. aiTaskType and submissionId are required.", payload);
        return { role: "error", parts: [{ text: "内部调用AI错误：参数不足。" }] };
    }
    try {
        const getAiFeedbackFunction = httpsCallable(functions, 'getAiFeedback');
        console.log("内部调用云函数 getAiFeedback (internal), 发送数据:", payload);
        const result = await getAiFeedbackFunction(payload); // Firebase SDK 会自动包装为 {data: payload}
        console.log("内部调用云函数 getAiFeedback 返回结果:", result.data); // result.data 是云函数 return 的对象
        return result.data;
    } catch (error) {
        console.error("内部调用云函数 getAiFeedback 失败:", error);
        let errorMessage = "AI服务内部调用失败。";
        if (error.code && error.message) errorMessage = `AI错误 (${error.code}): ${error.message}`;
        else if (error.message) errorMessage = `错误: ${error.message}`;
        return { role: "error", parts: [{ text: errorMessage }] };
    }
}

async function completeInProgressTaskFlow() {
    console.log(`用户确认完成任务: ${activeTask.title}`);
    // 确保必要的UI元素已获取 (在函数顶部已获取)
    if (!completeTaskButton || !userInput || !sendButton || !currentUser || !activeTask || !activeSubmission || !activeSubmission.id) {
        console.error("completeInProgressTaskFlow: 关键变量或UI元素未准备好。");
        alert("无法完成任务，请刷新或重新进入任务。");
        return;
    }

    // 禁用UI
    completeTaskButton.disabled = true;
    completeTaskButton.textContent = "处理中...";
    userInput.disabled = true;
    sendButton.disabled = true;
    // if (uploadEssayButton) uploadEssayButton.disabled = true;
    // if (submitRevisionButton) submitRevisionButton.disabled = true;

    const processingMessageId = `processing-complete-${Date.now()}`;
    displayMessage("正在处理任务完成，AI分析中，请耐心等待（可能需要1-2分钟）...", 'system', '', processingMessageId);

    let overallSuccess = true;

    try {
        // --- 步骤 4.4.1: 计算本次任务的总互动次数 ---
        let interactionCountWithAI_currentTask = 0;
        try {
            const chatsColRef = collection(db, "taskSubmissions", activeSubmission.id, "chats");
            const chatsSnapshot = await getDocs(chatsColRef);
            // 更精确的计数：用户消息 + AI模型消息（不计系统消息）
            chatsSnapshot.forEach(docSnap => {
                if (docSnap.data().role === 'user' || docSnap.data().role === 'model') {
                    interactionCountWithAI_currentTask++;
                }
            });
            console.log("本次任务有效互动次数计算完成:", interactionCountWithAI_currentTask);
        } catch (countError) {
            console.error("计算互动次数失败:", countError);
            displayMessage("警告：计算互动次数时出错。", 'system', 'error');
            // 继续执行，AI侧不强依赖此数字
        }

        // --- 步骤 4.4.2 & 4.4.3: 调用云函数生成所有数据 ---
        console.log("调用云函数进行任务定稿和E-Portfolio生成 for submissionId:", activeSubmission.id);
        const aiResultPayload = await callAiFunctionInternal({ // 这个函数现在应该返回云函数直接return的JS对象
            aiTaskType: "finalizeTaskAndGenerateEportfolio",
            submissionId: activeSubmission.id,
            userId: currentUser.uid,
            interactionCount: interactionCountWithAI_currentTask
        });

        // --- 步骤 4.4.4: 处理并保存返回的JSON数据 ---
        // 假设 aiResultPayload 就是云函数返回的包含8个字段的JS对象 (如果role是error，则已在callAiFunctionInternal处理)
        if (aiResultPayload && aiResultPayload.role !== "error" && aiResultPayload.currentTaskRawScore !== undefined) {
            console.log("AI云函数成功返回结构化数据:", aiResultPayload);

            const {
                currentTaskRawScore,
                currentTaskWritingSkills,
                obviousErrorsInTask,
                teacherAttentionPoints,
                selfRegulationIndex_cumulative, // AI更新后的
                overallWritingAbilityIndex_current, // AI更新后的
                taskCompletionReport_generated,
                detailedEportfolioText_updated
            } = aiResultPayload;

            // A. 准备保存到 /taskSubmissions/{id}.aiAnalysisResult 的数据
            const aiAnalysisResultData = {
                currentTaskRawScore: currentTaskRawScore || 0,
                currentTaskWritingSkills: currentTaskWritingSkills || {},
                obviousErrorsInTask: obviousErrorsInTask || "无明显错误记录。",
                teacherAttentionPoints: teacherAttentionPoints || "无特别关注点。",
                taskCompletionReport_generated: taskCompletionReport_generated || "任务报告内容未生成。",
                interactionCountWithAI_currentTask: interactionCountWithAI_currentTask, // 我们自己计算的
                // 按照文档8节，这里应该还包含AI生成的 selfRegulationIndex (本次任务的) 和各项能力得分
                // 但根据最新逻辑，AI直接返回了累积的 selfRegulationIndex_cumulative，
                // 并且 currentTaskWritingSkills 已经是本次任务的能力得分。
                // 所以，aiAnalysisResult 可能还需要一个本次任务的 selfRegulationIndex (如果AI能提供)
                // 暂时我们只存以上内容
            };
            if (selfRegulationIndex_cumulative !== undefined) { // 如果AI也返回了本次的自我调控，可以加上
                 // aiAnalysisResultData.selfRegulationIndex_thisTask = aiResultPayload.selfRegulationIndex_thisTask; // 假设有这个字段
            }


            // B. 准备更新到 /users/{uid}/ePortfolioData 的数据
            const ePortfolioUpdates = {
                // selfRegulationIndex_cumulative, overallWritingAbilityIndex_current 将直接使用AI返回的值
                selfRegulationIndex_cumulative: selfRegulationIndex_cumulative !== undefined ? selfRegulationIndex_cumulative : null,
                overallWritingAbilityIndex_current: overallWritingAbilityIndex_current !== undefined ? overallWritingAbilityIndex_current : null,
                // 其他累积字段 (如 averageTaskScore, progressIndex, cumulativeWritingSkills, firstTaskWritingSkills, cumulativeErrorTypeStats)
                // 仍然需要后端算法或更复杂的前端逻辑，基于历史和本次任务数据来更新。
                // 当前步骤简化：我们主要依赖AI给出的这两个核心累积/综合指标。
                // 后续步骤 (例如 步骤6.2 后端算法) 会完善这些其他累积字段的计算。
            };

            // C. 步骤 4.4.5: (前端计算段位)
            if (ePortfolioUpdates.overallWritingAbilityIndex_current !== null && ePortfolioUpdates.selfRegulationIndex_cumulative !== null) {
                const baseScore = (ePortfolioUpdates.overallWritingAbilityIndex_current * 0.8) + (ePortfolioUpdates.selfRegulationIndex_cumulative * 0.2);
                ePortfolioUpdates.rankTitle = getRankTitle(Math.round(baseScore)); // 四舍五入
                console.log("计算段位基础分:", baseScore, "段位:", ePortfolioUpdates.rankTitle);
            } else {
                console.warn("无法计算段位，缺少综合能力指数或自我调控得分。");
                ePortfolioUpdates.rankTitle = "段位待评估";
            }

            // D. 执行 Firestore 更新
            const submissionDocRef = doc(db, "taskSubmissions", activeSubmission.id);
            const userDocRef = doc(db, "users", currentUser.uid);

            // 为了原子性，理想情况下这些写操作应该在一个 batch 中，或者通过一个后端事务完成。
            // 但前端分步写也可以，只是要注意错误处理。
            await updateDoc(submissionDocRef, {
                aiAnalysisResult: aiAnalysisResultData, // 将分析结果存为一个对象
                lastUpdatedAt: serverTimestamp()
                // status 和 endTime 在所有保存成功后再更新
            });
            console.log("AI分析结果已保存到 Task Submission。");

            await setDoc(userDocRef, { // 使用 setDoc 与 merge:true 来创建或更新
                ePortfolioData: ePortfolioUpdates, // 将 E-Portfolio 数据存为一个对象
                ePortfolioText: detailedEportfolioText_updated || "E-Portfolio文本内容未生成。",
                ePortfolioLastUpdatedAt: serverTimestamp()
            }, { merge: true });
            console.log("用户E-Portfolio数据和文本已更新。");

            displayMessage("AI分析完成，报告和E-Portfolio已更新！", 'system');

        } else { // AI未能返回预期的结构化数据
            console.error("AI未能成功生成或返回结构化数据:", aiResultPayload);
            const errorMsg = aiResultPayload && aiResultPayload.parts && aiResultPayload.parts[0] ? aiResultPayload.parts[0].text : (aiResultPayload && aiResultPayload.text ? aiResultPayload.text : "未知AI错误或返回格式不符");
            displayMessage(`错误：AI未能完成任务分析。${errorMsg}`, 'system', 'error');
            overallSuccess = false;
        }

        // --- 步骤 4.4.6: 更新任务提交状态为 "completed" ---
        if (overallSuccess) {
            console.log("所有数据处理完毕，尝试更新任务状态为 'completed'。");
            const submissionDocRef = doc(db, "taskSubmissions", activeSubmission.id);
            await updateDoc(submissionDocRef, {
                status: "completed",
                endTime: serverTimestamp(),
                lastUpdatedAt: serverTimestamp() // 再次更新，确保是最新
            });
            activeSubmission.status = "completed";
            activeSubmission.endTime = new Date();
            activeSubmission.lastUpdatedAt = new Date();
            console.log("任务状态已更新为 'completed'。");
            displayMessage(`任务 "${activeTask.title}" 已成功完成！`, 'system');
            alert(`任务 "${activeTask.title}" 已完成！`);
        } else {
            displayMessage(`任务 "${activeTask.title}" 处理未完全成功，部分数据可能未更新。请检查提示或稍后重试。`, 'system', 'error');
            alert(`任务 "${activeTask.title}" 处理未完全成功。`);
        }

    } catch (error) {
        console.error("完成任务流程中发生严重错误:", error);
        displayMessage(`错误：完成任务时发生严重错误 - ${error.message}`, 'system', 'error');
        alert("完成任务时发生严重错误: " + error.message);
        overallSuccess = false;
    } finally {
        removeMessageById(processingMessageId);
        updateChatUIState(); // 根据最新的 activeSubmission.status 更新所有相关UI
        console.log("完成任务流程结束，UI状态已更新。");
    }
}

// --- 新增：通过ID移除消息的辅助函数 ---
function removeMessageById(messageId) {
    if (!chatbox || !messageId) return;
    const msg = document.getElementById(messageId);
    if (msg) {
        chatbox.removeChild(msg);
        console.log("Removed message with ID:", messageId);
    }
}

async function handleSendMessage() {
    if (!currentUser || !activeTask || !activeSubmission || !activeSubmission.id) {
        displayMessage("错误：无法发送消息，请重新进入任务。", 'system', 'error');
        return;
    }
    const messageText = userInput.value.trim();
    if (!messageText) return; // 不发送空消息

    // 立即显示用户消息
    const tempMessageType = activeSubmission.essaySubmitted ? 'dialogue' : 'submission';
    displayMessage(messageText, 'user', tempMessageType);
    userInput.value = '';
    userInput.focus();

    try {
        let messageType = 'dialogue';
        let isFirstSubmission = false;

        if (!activeSubmission.essaySubmitted) {
            messageType = 'submission';
            isFirstSubmission = true;
        }

        const chatMessageData = {
            role: 'user',
            parts: [{ text: messageText }],
            timestamp: serverTimestamp(),
            messageType: messageType,
            userId: currentUser.uid
        };
        const chatsColRef = collection(db, "taskSubmissions", activeSubmission.id, "chats");
        await addDoc(chatsColRef, chatMessageData);
        console.log("用户消息已保存到 chats:", messageText);

        if (isFirstSubmission) {
            const submissionDocRef = doc(db, "taskSubmissions", activeSubmission.id);
            await updateDoc(submissionDocRef, {
                essaySubmitted: true,
                essaySubmittedAt: serverTimestamp(),
                lastUpdatedAt: serverTimestamp()
            });
            activeSubmission.essaySubmitted = true;
            activeSubmission.essaySubmittedAt = new Date(); // Local approx.
            activeSubmission.lastUpdatedAt = new Date();  // Local approx.
            console.log("TaskSubmission updated: essaySubmitted = true");
            updateChatUIState(); // 更新UI，使“完成任务”按钮可用，输入框可用
        } else { // 普通对话，只更新 lastUpdatedAt
            const submissionDocRef = doc(db, "taskSubmissions", activeSubmission.id);
            await updateDoc(submissionDocRef, { lastUpdatedAt: serverTimestamp() });
            activeSubmission.lastUpdatedAt = new Date();
            console.log("TaskSubmission updated: lastUpdatedAt");
        }
        // 统一调用 AI (普通对话)
        await callAiFunction(messageText, "dialogue", activeSubmission.id); // 明确 taskType

    } catch (error) {
        console.error("发送消息或更新任务提交状态失败:", error);
        displayMessage(`抱歉，发送消息失败: ${error.message || '未知错误'}`, 'system', 'error');
    }
}

function updateChatUIState() {
    // 只操作您代码中已明确获取的元素
    if (!activeSubmission || !completeTaskButton || !userInput || !sendButton) {
        console.warn("updateChatUIState: activeSubmission or critical UI elements (completeTaskButton, userInput, sendButton) missing.");
        if (completeTaskButton) completeTaskButton.disabled = true;
        if (userInput) userInput.disabled = true;
        if (sendButton) sendButton.disabled = true;
        return;
    }

    const isEssaySubmitted = activeSubmission.essaySubmitted === true;

    if (activeSubmission.status === "in-progress") {
        completeTaskButton.textContent = "完成本次任务";
        completeTaskButton.disabled = false;

        userInput.placeholder = isEssaySubmitted ? "在此输入您的消息与AI交流..." : "请先提交作文内容..."; // 假设无上传按钮，直接提示
        userInput.disabled = false;
        sendButton.disabled = false;

    } else if (activeSubmission.status === "completed") {
        completeTaskButton.textContent = "记录对话更新E-Portfolio"; // 根据文档4.6
        completeTaskButton.disabled = false;

        userInput.placeholder = "任务已完成。您可在此补充对话以更新E-Portfolio...";
        userInput.disabled = false;
        sendButton.disabled = false;
    } else {
        completeTaskButton.textContent = "状态异常";
        completeTaskButton.disabled = true;
        userInput.placeholder = "当前无法进行操作。";
        userInput.disabled = true;
        sendButton.disabled = true;
    }
    console.log("Chat UI state updated. Status:", activeSubmission.status, "Essay Submitted:", isEssaySubmitted);
}

// --- 新增：在聊天框中显示消息的辅助函数 ---
function displayMessage(text, role, messageType = '', elementId = null) {
    if (!chatbox) return;
    const messageDiv = document.createElement('div');
    if (elementId) messageDiv.id = elementId;
    messageDiv.classList.add('message');
    if (role === 'user') messageDiv.classList.add('user-message');
    else if (role === 'model') messageDiv.classList.add('model-message');
    else if (role === 'system') {
        messageDiv.classList.add('system-message');
        if (messageType === 'error') {
            messageDiv.style.color = 'red';
            messageDiv.style.fontWeight = 'bold';
        }
    }
    messageDiv.innerHTML = text.replace(/\n/g, '<br>');
    chatbox.appendChild(messageDiv);
    chatbox.scrollTop = chatbox.scrollHeight;
}


// 初始UI状态：显示仪表盘和任务列表，隐藏聊天界面
// (已有的初始UI状态设置保持不变)
if (eportfolioDashboardArea) eportfolioDashboardArea.style.display = 'block';
if (taskListArea) taskListArea.style.display = 'block';
if (chatInterface) chatInterface.style.display = 'none';