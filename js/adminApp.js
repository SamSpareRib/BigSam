// js/adminApp.js
import { app, auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

console.log("adminApp.js loaded");

// DOM Elements - Profile & Basic Nav
const adminProfileCircleIcon = document.getElementById('admin-profile-circle-icon');
const adminProfileDropdownMenu = document.getElementById('admin-profile-dropdown-menu');
const adminProfileUserName = document.getElementById('admin-profile-user-name');
const adminProfileUserEmail = document.getElementById('admin-profile-user-email');
const adminLogoutButton = document.getElementById('admin-logout-button');

const sidebarLinks = document.querySelectorAll('.admin-sidebar ul li a');
const tabContents = document.querySelectorAll('.admin-tab-content');

// DOM Elements - Global Prompts Form (from prompt-config-tab)
const globalPromptsForm = document.getElementById('global-prompts-form'); // The form itself
const globalSystemPromptTextarea = document.getElementById('global-system-prompt');
const eportfolioGenerationPromptTextarea = document.getElementById('eportfolio-generation-prompt');
const singleTaskReportPromptTextarea = document.getElementById('single-task-report-prompt');
const teacherClassSingleTaskReportPromptTextarea = document.getElementById('teacher-class-single-task-report-prompt');
const teacherClassCumulativeReportPromptTextarea = document.getElementById('teacher-class-cumulative-report-prompt');

const saveGlobalPromptsButton = document.getElementById('save-global-prompts-button'); // Updated button ID
const globalPromptsSaveMessage = document.getElementById('global-prompts-save-message'); // Updated message element ID

// --- 右上角用户信息区逻辑 ---
if (adminProfileCircleIcon) {
    adminProfileCircleIcon.addEventListener('click', () => {
        if (adminProfileDropdownMenu) {
            adminProfileDropdownMenu.style.display = adminProfileDropdownMenu.style.display === 'block' ? 'none' : 'block';
        }
    });
}
document.addEventListener('click', function(event) {
    if (adminProfileCircleIcon && adminProfileDropdownMenu &&
        !adminProfileCircleIcon.contains(event.target) &&
        !adminProfileDropdownMenu.contains(event.target) &&
        adminProfileDropdownMenu.style.display === 'block') {
        adminProfileDropdownMenu.style.display = 'none';
    }
});

// --- 保存所有全局Prompt的逻辑 ---
if (saveGlobalPromptsButton && globalPromptsForm) {
    saveGlobalPromptsButton.addEventListener('click', async () => {
        if (globalPromptsSaveMessage) globalPromptsSaveMessage.textContent = "";

        // 获取所有Prompt文本
        const systemPrompt = globalSystemPromptTextarea ? globalSystemPromptTextarea.value.trim() : "";
        const eportfolioPrompt = eportfolioGenerationPromptTextarea ? eportfolioGenerationPromptTextarea.value.trim() : "";
        const singleTaskReportPrompt = singleTaskReportPromptTextarea ? singleTaskReportPromptTextarea.value.trim() : "";
        const teacherClassSingleTaskReportPrompt = teacherClassSingleTaskReportPromptTextarea ? teacherClassSingleTaskReportPromptTextarea.value.trim() : "";
        const teacherClassCumulativeReportPrompt = teacherClassCumulativeReportPromptTextarea ? teacherClassCumulativeReportPromptTextarea.value.trim() : "";


        // 基础校验：至少系统Prompt不能为空 (可以根据需求调整)
        if (!systemPrompt) {
            alert("全局系统前置命令 (System Prompt) 内容不能为空！");
            if (globalPromptsSaveMessage) {
                globalPromptsSaveMessage.textContent = "错误：系统Prompt不能为空！";
                globalPromptsSaveMessage.style.color = "red";
            }
            return;
        }

        const promptsToSave = {
            defaultSystemPromptText: systemPrompt,
            defaultEPortfolioGenerationPromptText: eportfolioPrompt,
            defaultSingleTaskReportPromptText: singleTaskReportPrompt,
            defaultTeacherClassSingleTaskReportPromptText: teacherClassSingleTaskReportPrompt,
            defaultTeacherClassCumulativeReportPromptText: teacherClassCumulativeReportPrompt,
            lastUpdated: serverTimestamp()
            // 未来可以为每个Prompt添加启用/禁用状态字段
            // defaultSystemPromptEnabled: true,
            // defaultEPortfolioGenerationPromptEnabled: true,
            // etc.
        };

        try {
            const docRef = doc(db, "settings", "globalPromptConfig");
            await setDoc(docRef, promptsToSave, { merge: true }); // 使用 merge: true 很重要！

            console.log("所有全局Prompt已保存！", promptsToSave);
            if (globalPromptsSaveMessage) {
                globalPromptsSaveMessage.textContent = "所有全局Prompt已成功保存！";
                globalPromptsSaveMessage.style.color = "green";
            }
        } catch (error) {
            console.error("保存全局Prompts失败:", error);
            if (globalPromptsSaveMessage) {
                globalPromptsSaveMessage.textContent = "保存失败: " + error.message;
                globalPromptsSaveMessage.style.color = "red";
            }
        }
    });
}


// --- Auth State Change ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("admin.html: User is logged in:", user);
        if (adminProfileUserName) adminProfileUserName.textContent = user.displayName || "管理员";
        if (adminProfileUserEmail) adminProfileUserEmail.textContent = user.email;
        if (adminProfileCircleIcon) {
            const displayName = user.displayName;
            if (displayName) {
                const firstChar = displayName.charAt(0);
                if (/[\u4e00-\u9fa5]/.test(firstChar)) {
                    adminProfileCircleIcon.textContent = firstChar;
                } else {
                    adminProfileCircleIcon.textContent = firstChar.toUpperCase();
                }
            } else if (user.email) {
                adminProfileCircleIcon.textContent = user.email.charAt(0).toUpperCase();
            } else {
                 adminProfileCircleIcon.textContent = "A";
            }
        }

        // 检查初始激活的Tab并加载数据
        const activeTabLink = document.querySelector('.admin-sidebar ul li a.active');
        if (activeTabLink) {
            const initialTabId = activeTabLink.dataset.tab;
            if (initialTabId === "prompt-config") {
                loadAllGlobalPrompts(); // 加载所有 Prompts
            }
        } else { // 如果没有手动设置 active class，可以默认加载第一个Tab的数据
            const firstTabLink = document.querySelector('.admin-sidebar ul li a');
            if (firstTabLink) {
                const firstTabId = firstTabLink.dataset.tab;
                // 模拟点击以激活并加载 (或者直接调用加载函数)
                firstTabLink.click();
                // if (firstTabId === "prompt-config") {
                //     loadAllGlobalPrompts();
                // }
            }
        }

    } else {
        console.log("admin.html: User is not logged in. Redirecting to index.html");
        window.location.href = 'index.html';
    }
});

// --- Logout ---
if (adminLogoutButton) {
    adminLogoutButton.addEventListener('click', async () => {
        try {
            if (adminProfileDropdownMenu) adminProfileDropdownMenu.style.display = 'none';
            await signOut(auth);
        } catch (error) {
            console.error("admin.html: Sign out error", error);
            alert("退出失败: " + error.message);
        }
    });
}

// --- Tab Navigation Logic ---
sidebarLinks.forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const tabId = this.dataset.tab;

        sidebarLinks.forEach(s_link => s_link.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        this.classList.add('active');
        const activeContent = document.getElementById(tabId + '-tab');
        if (activeContent) {
            activeContent.classList.add('active');
        }
        console.log("Switched to tab:", tabId);

        if (tabId === "prompt-config") {
            loadAllGlobalPrompts(); // 加载所有 Prompts
            if (globalPromptsSaveMessage) globalPromptsSaveMessage.textContent = "";
        }
    });
});

// --- 加载所有已保存的全局Prompt (在页面加载或Tab切换时) ---
async function loadAllGlobalPrompts() {
    // 确保所有 textarea 元素都已获取
    if (!globalSystemPromptTextarea || !eportfolioGenerationPromptTextarea || !singleTaskReportPromptTextarea || !teacherClassSingleTaskReportPromptTextarea || !teacherClassCumulativeReportPromptTextarea) {
        console.warn("一个或多个Prompt textarea 元素未找到，无法加载。");
        return;
    }

    try {
        const docRef = doc(db, "settings", "globalPromptConfig");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const configData = docSnap.data();
            console.log("从Firestore加载的globalPromptConfig:", configData);

            globalSystemPromptTextarea.value = configData.defaultSystemPromptText || "";
            eportfolioGenerationPromptTextarea.value = configData.defaultEPortfolioGenerationPromptText || "";
            singleTaskReportPromptTextarea.value = configData.defaultSingleTaskReportPromptText || "";
            teacherClassSingleTaskReportPromptTextarea.value = configData.defaultTeacherClassSingleTaskReportPromptText || "";
            teacherClassCumulativeReportPromptTextarea.value = configData.defaultTeacherClassCumulativeReportPromptText || "";

            console.log("所有全局Prompt已加载到表单。");
            if (globalPromptsSaveMessage) {
                globalPromptsSaveMessage.textContent = "Prompt已加载。";
                globalPromptsSaveMessage.style.color = "blue";
                setTimeout(() => { if (globalPromptsSaveMessage) globalPromptsSaveMessage.textContent = ""; }, 3000);
            }

        } else {
            console.log("globalPromptConfig 文档不存在。将清空所有Prompt输入框。");
            globalSystemPromptTextarea.value = "";
            eportfolioGenerationPromptTextarea.value = "";
            singleTaskReportPromptTextarea.value = "";
            teacherClassSingleTaskReportPromptTextarea.value = "";
            teacherClassCumulativeReportPromptTextarea.value = "";
            if (globalPromptsSaveMessage) globalPromptsSaveMessage.textContent = "未找到已保存的Prompt配置。";
        }
    } catch (error) {
        console.error("加载所有全局Prompt失败:", error);
        if (globalPromptsSaveMessage) {
            globalPromptsSaveMessage.textContent = "加载Prompts失败: " + error.message;
            globalPromptsSaveMessage.style.color = "red";
        }
    }
}

// (后续步骤会在此文件添加更多管理员功能)