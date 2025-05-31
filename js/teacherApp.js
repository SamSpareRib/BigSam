// js/teacherApp.js
import { app, auth, db } from './firebase-init.js'; // 确保 app 被导入
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, doc, getDoc, query, where, orderBy, getDocs,
    addDoc, updateDoc, serverTimestamp, deleteDoc, Timestamp // Timestamp for date conversions
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// import { collection, doc, getDoc, query, where, orderBy, getDocs, addDoc, updateDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


console.log("teacherApp.js loaded");

// --- Global Variables ---
let currentTeacherUser = null;
const COURSE_ID_FOR_TESTING = "TyZxryUWqZCAruw2SZI3";

// --- DOM Elements ---
// Top Nav Profile
const teacherProfileCircleIcon = document.getElementById('teacher-profile-circle-icon');
const teacherProfileDropdownMenu = document.getElementById('teacher-profile-dropdown-menu');
const teacherProfileUserName = document.getElementById('teacher-profile-user-name');
const teacherProfileUserEmail = document.getElementById('teacher-profile-user-email');
const teacherLogoutButton = document.getElementById('teacher-logout-button');
// const teacherFeedbackButton = document.getElementById('teacher-feedback-button'); // For later
// 新增：学生管理 Tab 相关 DOM 元素
const studentListContainer = document.getElementById('student-list-container');
const studentsLoadingMessage = document.getElementById('students-loading-message');
// Tabs
const tabLinks = document.querySelectorAll('.teacher-tabs .tab-link');
const tabContents = document.querySelectorAll('.teacher-tab-content');
// Task Management Tab Elements
const addNewTaskButton = document.getElementById('add-new-task-button');
const taskListContainer = document.getElementById('task-list-container');
const tasksLoadingMessage = document.getElementById('tasks-loading-message');
// Task Form Modal Elements
const taskFormModal = document.getElementById('task-form-modal');
const taskModalTitle = document.getElementById('task-modal-title');
const closeTaskModalButton = document.getElementById('close-task-modal-button');
const taskForm = document.getElementById('task-form');
const taskIdEditField = document.getElementById('task-id-edit'); // Hidden input for task ID
const taskTitleField = document.getElementById('task-title');
const taskDescriptionField = document.getElementById('task-description');
const taskObjectivesField = document.getElementById('task-objectives');
const taskAiGradingStandardField = document.getElementById('task-ai-grading-standard');
const taskStartDateField = document.getElementById('task-start-date');
const taskEndDateField = document.getElementById('task-end-date');
const saveTaskButton = document.getElementById('save-task-button');
const taskFormMessage = document.getElementById('task-form-message');

const textDisplayModal = document.getElementById('text-display-modal');
const modalTitle = document.getElementById('modal-title');
const modalTextContent = document.getElementById('modal-text-content');
const closeTextModalButton = document.getElementById('close-text-modal-button');

// --- Right Top Profile Dropdown Logic ---
if (teacherProfileCircleIcon) {
    teacherProfileCircleIcon.addEventListener('click', () => {
        if (teacherProfileDropdownMenu) {
            teacherProfileDropdownMenu.style.display = teacherProfileDropdownMenu.style.display === 'block' ? 'none' : 'block';
        }
    });
}
document.addEventListener('click', function(event) {
    if (teacherProfileCircleIcon && teacherProfileDropdownMenu &&
        !teacherProfileCircleIcon.contains(event.target) &&
        !teacherProfileDropdownMenu.contains(event.target) &&
        teacherProfileDropdownMenu.style.display === 'block') {
        teacherProfileDropdownMenu.style.display = 'none';
    }
});

// --- Authentication State Observer ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentTeacherUser = user;
        console.log("teacher.html: User is logged in:", currentTeacherUser);

        // TODO: Implement robust role checking here (e.g., via custom claims or Firestore role)
        // For now, we rely on auth.js redirecting only specific teacher emails here.
        // If a non-teacher somehow lands here, they might see the UI but functionality would be limited by Firestore rules.

        if (teacherProfileUserName) teacherProfileUserName.textContent = currentTeacherUser.displayName || "教师用户";
        if (teacherProfileUserEmail) teacherProfileUserEmail.textContent = currentTeacherUser.email;
        if (teacherProfileCircleIcon) {
            const displayName = currentTeacherUser.displayName;
            let initialChar = "T"; // Default for Teacher
            if (displayName) {
                const firstChar = displayName.charAt(0);
                initialChar = /[\u4e00-\u9fa5]/.test(firstChar) ? firstChar : firstChar.toUpperCase();
            } else if (currentTeacherUser.email) {
                initialChar = currentTeacherUser.email.charAt(0).toUpperCase();
            }
            teacherProfileCircleIcon.textContent = initialChar;
        }

        // Initialize by showing the default active tab content (if any specific logic needed)
        const activeTabLink = document.querySelector('.teacher-tabs .tab-link.active');
        if (activeTabLink) {
            loadDataForTab(activeTabLink.dataset.tab);
        }
    } else {
        currentTeacherUser = null;
        console.log("teacher.html: User is not logged in. Redirecting to index.html");
        // Ensure this only happens if not already on index.html to avoid redirect loops
        if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
             window.location.href = 'index.html';
        }
    }
});

// --- Logout Button ---
if (teacherLogoutButton) {
    teacherLogoutButton.addEventListener('click', async () => {
        try {
            if (teacherProfileDropdownMenu) teacherProfileDropdownMenu.style.display = 'none';
            await signOut(auth);
            // onAuthStateChanged will handle the redirect to index.html
        } catch (error) {
            console.error("teacher.html: Sign out error", error);
            alert("退出失败: " + error.message);
        }
    });
}
// --- （新增/确认）通用文本显示模态框的关闭逻辑 ---
if (textDisplayModal) { // 先确保模态框本身存在
    // 1. 通过右上角的关闭按钮关闭模态框
    if (closeTextModalButton) {
        closeTextModalButton.addEventListener('click', () => {
            textDisplayModal.style.display = 'none';
            if (modalTextContent) modalTextContent.innerHTML = ''; // 清空内容，以便下次打开是干净的
            if (modalTitle) modalTitle.textContent = ''; // 清空标题
        });
    }

    // 2. (可选) 点击模态框外部（背景遮罩层）关闭模态框
    //    注意：这里我们监听的是 window 的 click 事件，然后判断 target。
    //    或者，如果您的模态框背景就是 textDisplayModal 本身，也可以直接监听 textDisplayModal 的 click。
    window.addEventListener('click', (event) => {
        if (event.target === textDisplayModal) { // 如果点击的是模态框背景本身
            textDisplayModal.style.display = 'none';
            if (modalTextContent) modalTextContent.innerHTML = '';
            if (modalTitle) modalTitle.textContent = '';
        }
    });
}
// --- Task Form Modal Logic ---
if (addNewTaskButton) {
    addNewTaskButton.addEventListener('click', () => {
        openTaskModalForCreate();
    });
}
if (closeTaskModalButton) {
    closeTaskModalButton.addEventListener('click', () => {
        taskFormModal.style.display = 'none';
    });
}
if (taskForm) {
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentTeacherUser) {
            taskFormMessage.textContent = "错误：用户未登录！";
            taskFormMessage.style.color = "red";
            return;
        }

        const taskIdToEdit = taskIdEditField.value; // Check if we are editing
        const title = taskTitleField.value.trim();
        const description = taskDescriptionField.value.trim();
        const objectives = taskObjectivesField.value.trim();
        const gradingStandard = taskAiGradingStandardField.value;
        const startDateStr = taskStartDateField.value;
        const endDateStr = taskEndDateField.value;

        if (!title || !description || !objectives) {
            taskFormMessage.textContent = "错误：任务标题、描述和目标不能为空！";
            taskFormMessage.style.color = "red";
            return;
        }
        if (startDateStr && endDateStr && new Date(startDateStr) > new Date(endDateStr)) {
            taskFormMessage.textContent = "错误：开始日期不能晚于截止日期！";
            taskFormMessage.style.color = "red";
            return;
        }

        saveTaskButton.disabled = true;
        saveTaskButton.textContent = taskIdToEdit ? "保存中..." : "发布中...";
        taskFormMessage.textContent = "";

        const taskData = {
            title: title,
            description: description,
            taskObjectives: objectives,
            courseId: COURSE_ID_FOR_TESTING, // 硬编码测试课程ID
            publisherId: currentTeacherUser.uid,
            publisherName: currentTeacherUser.displayName || currentTeacherUser.email,
            // aiGradingStandard: gradingStandard, // 只在新建时设置
            // startDate, endDate 需要转换为 Firestore Timestamp
            startDate: startDateStr ? Timestamp.fromDate(new Date(startDateStr)) : null,
            endDate: endDateStr ? Timestamp.fromDate(new Date(endDateStr)) : null,
            lastUpdatedAt: serverTimestamp()
        };

        try {
            if (taskIdToEdit) { // Editing existing task
                // 对于编辑，不应修改 createdAt 和 aiGradingStandard (除非特定逻辑允许)
                const taskDocRef = doc(db, "tasks", taskIdToEdit);
                await updateDoc(taskDocRef, taskData); // updateDoc 只更新指定字段
                taskFormMessage.textContent = "任务更新成功！";
            } else { // Creating new task
                taskData.aiGradingStandard = gradingStandard; // 新建时设置评分标准
                taskData.createdAt = serverTimestamp();
                const docRef = await addDoc(collection(db, "tasks"), taskData);
                console.log("新任务已创建，ID: ", docRef.id);
                taskFormMessage.textContent = "新任务发布成功！";
            }
            taskFormMessage.style.color = "green";
            taskForm.reset();
            taskIdEditField.value = ''; // Clear edit ID
            setTimeout(() => { // 稍作延迟关闭模态框并刷新列表
                taskFormModal.style.display = 'none';
                loadAndDisplayTasks();
            }, 1500);

        } catch (error) {
            console.error("保存任务失败:", error);
            taskFormMessage.textContent = "操作失败: " + error.message;
            taskFormMessage.style.color = "red";
        } finally {
            saveTaskButton.disabled = false;
            saveTaskButton.textContent = "保存任务";
        }
    });
}


// --- Tab Navigation Logic ---
tabLinks.forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const tabId = this.dataset.tab;

        tabLinks.forEach(s_link => s_link.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        this.classList.add('active');
        const activeContent = document.getElementById(tabId + '-tab');
        if (activeContent) {
            activeContent.classList.add('active');
        }
        console.log("Switched to tab:", tabId);
        loadDataForTab(this.dataset.tab); 
});
});

// --- Load Data for Active Tab ---
async function loadDataForTab(tabId) {
    if (!currentTeacherUser) return;
    console.log(`Loading data for tab: ${tabId}`);
    if (tabId === "tasks") {
        await loadAndDisplayTasks();
    } else if (tabId === "students") { // <--- 新增分支
        await loadAndDisplayStudents();
    } else if (tabId === "dashboard") {
        // TODO: Load dashboard data
    }
}

// --- Task Management Functions ---
async function loadAndDisplayTasks() {
    if (!taskListContainer || !tasksLoadingMessage) return;
    taskListContainer.innerHTML = ''; // Clear previous list
    tasksLoadingMessage.textContent = '正在加载任务列表...';
    tasksLoadingMessage.style.color = '#777';

    try {
        const tasksRef = collection(db, "tasks");
        // 现阶段，我们获取所有任务。未来可以根据 currentTeacherUser.uid 过滤 (如果任务有 publisherId)
        // 或根据课程ID过滤
        const q = query(tasksRef, where("courseId", "==", COURSE_ID_FOR_TESTING), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            tasksLoadingMessage.textContent = '暂无已发布的任务。';
            return;
        }
        tasksLoadingMessage.textContent = ''; // Clear loading message

        querySnapshot.forEach(docSnap => {
            const task = docSnap.data();
            const taskId = docSnap.id;
            const taskElement = createTaskElement(taskId, task);
            taskListContainer.appendChild(taskElement);
        });
    } catch (error) {
        console.error("加载任务列表失败:", error);
        tasksLoadingMessage.textContent = '加载任务列表失败: ' + error.message;
        tasksLoadingMessage.style.color = 'red';
    }
}

function createTaskElement(taskId, task) {
    const div = document.createElement('div');
    div.className = 'task-item'; // Add a class for styling
    div.style.border = "1px solid #eee";
    div.style.padding = "15px";
    div.style.marginBottom = "10px";
    div.style.borderRadius = "5px";

    const header = document.createElement('div');
    header.className = 'task-item-header';
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "10px";

    const title = document.createElement('h5');
    title.className = 'task-title';
    title.textContent = task.title;
    title.style.margin = "0";

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = '编辑';
    editBtn.className = 'admin-button edit-task-btn'; // Re-use admin-button style
    editBtn.style.marginRight = "5px";
    editBtn.dataset.taskId = taskId;
    editBtn.addEventListener('click', () => openTaskModalForEdit(taskId, task));

    // 删除按钮 (可选)
    // const deleteBtn = document.createElement('button');
    // deleteBtn.textContent = '删除';
    // deleteBtn.className = 'admin-button delete-task-btn';
    // deleteBtn.style.backgroundColor = "#dc3545";
    // deleteBtn.dataset.taskId = taskId;
    // deleteBtn.addEventListener('click', () => handleDeleteTask(taskId, task.title));

    actions.appendChild(editBtn);
    // actions.appendChild(deleteBtn);
    header.appendChild(title);
    header.appendChild(actions);

    const description = document.createElement('p');
    description.className = 'task-description';
    description.textContent = task.description ? (task.description.substring(0, 150) + (task.description.length > 150 ? '...' : '')) : '无描述'; // 截断显示
    description.style.fontSize = "0.9em"; description.style.color = "#555";

    const details = document.createElement('p');
    details.style.fontSize = "0.8em"; details.style.color = "#777";
    const objectivesText = task.taskObjectives ? `目标: ${task.taskObjectives}` : "目标未设定";
    const gradingText = task.aiGradingStandard ? `评分标准: ${task.aiGradingStandard}` : "评分标准未设定";
    const createdAtDate = task.createdAt && task.createdAt.toDate ? task.createdAt.toDate().toLocaleDateString() : '未知';
    details.innerHTML = `<small>${objectivesText} | ${gradingText} | 发布于: ${createdAtDate}</small>`;

    div.appendChild(header);
    div.appendChild(description);
    div.appendChild(details);
    return div;
}
function openTaskModalForCreate() {
    taskForm.reset(); // Clear form fields
    taskIdEditField.value = ''; // Ensure no task ID for create mode
    taskModalTitle.textContent = '发布新任务';
    taskAiGradingStandardField.disabled = false; // 新任务允许设置
    taskFormMessage.textContent = '';
    taskFormModal.style.display = 'block';
}

async function openTaskModalForEdit(taskId, taskData) {
    taskForm.reset();
    taskIdEditField.value = taskId;
    taskModalTitle.textContent = '编辑任务 - ' + taskData.title;

    taskTitleField.value = taskData.title || '';
    taskDescriptionField.value = taskData.description || '';
    taskObjectivesField.value = taskData.taskObjectives || '';
    taskAiGradingStandardField.value = taskData.aiGradingStandard || 'standard';
    // 根据文档，已发布的任务AI评分严格程度不可编辑。
    // 我们需要一个逻辑来判断任务是否“已发布”（例如，是否有学生提交，或是否已过开始时间）
    // 暂时简化：如果是在编辑模式，就禁用它。
    taskAiGradingStandardField.disabled = true; // 编辑时禁用

    taskStartDateField.value = taskData.startDate && taskData.startDate.toDate ? taskData.startDate.toDate().toISOString().split('T')[0] : '';
    taskEndDateField.value = taskData.endDate && taskData.endDate.toDate ? taskData.endDate.toDate().toISOString().split('T')[0] : '';

    taskFormMessage.textContent = '';
    taskFormModal.style.display = 'block';
}

// --- 新增：学生管理相关函数 ---
async function loadAndDisplayStudents() {
    if (!studentListContainer || !studentsLoadingMessage) {
        console.error("loadAndDisplayStudents: Student list container or message element not found.");
        return;
    }
    studentListContainer.innerHTML = ''; // Clear previous list
    studentsLoadingMessage.textContent = '正在加载学生列表...';
    studentsLoadingMessage.style.color = '#777';

    try {
        const usersRef = collection(db, "users");
        // 筛选 role 为 "user" 的学生用户
        // 暂时不按班级筛选，显示所有学生
        const q = query(usersRef, where("role", "==", "user"), orderBy("name", "asc")); // 按姓名排序

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            studentsLoadingMessage.textContent = '暂无学生用户。';
            return;
        }
        studentsLoadingMessage.textContent = ''; // Clear loading message

        querySnapshot.forEach(docSnap => {
            const student = docSnap.data();
            const studentId = docSnap.id; // user.uid
            const studentElement = createStudentElement(studentId, student);
            studentListContainer.appendChild(studentElement);
        });

    } catch (error) {
        console.error("加载学生列表失败:", error);
        studentsLoadingMessage.textContent = '加载学生列表失败: ' + error.message;
        studentsLoadingMessage.style.color = 'red';
    }
}

function createStudentElement(studentId, studentData) {
    const div = document.createElement('div');
    div.className = 'student-item'; // For styling
    div.style.border = "1px solid #ddd";
    div.style.padding = "10px 15px";
    div.style.marginBottom = "10px";
    div.style.borderRadius = "5px";
    div.style.backgroundColor = "#fff";
    div.style.display = "flex";
    div.style.justifyContent = "space-between";
    div.style.alignItems = "center";

    const infoDiv = document.createElement('div');
    const nameP = document.createElement('p');
    nameP.textContent = `姓名: ${studentData.name || "未命名"}`;
    nameP.style.margin = "0 0 5px 0";
    nameP.style.fontWeight = "bold";

    const emailP = document.createElement('p');
    emailP.textContent = `邮箱: ${studentData.email || "未知"}`;
    emailP.style.margin = "0";
    emailP.style.fontSize = "0.9em";
    emailP.style.color = "#555";

    // (可选) 添加注册时间等其他信息
    // const createdAtDate = studentData.createdAt && studentData.createdAt.toDate ?
    //                       studentData.createdAt.toDate().toLocaleDateString() : '未知';
    // const registeredP = document.createElement('p');
    // registeredP.textContent = `注册于: ${createdAtDate}`;
    // registeredP.style.margin = "5px 0 0 0";
    // registeredP.style.fontSize = "0.8em";
    // registeredP.style.color = "#777";

    infoDiv.appendChild(nameP);
    infoDiv.appendChild(emailP);
    // infoDiv.appendChild(registeredP);

    const actionsDiv = document.createElement('div');
    const viewDetailsBtn = document.createElement('button');
    viewDetailsBtn.textContent = '查看详情';
    viewDetailsBtn.className = 'admin-button'; // Re-use admin-button style
    viewDetailsBtn.dataset.studentId = studentId;
    viewDetailsBtn.dataset.studentName = studentData.name || "该学生"; // 存储姓名方便后续使用

    viewDetailsBtn.addEventListener('click', () => {
        handleViewStudentDetails(studentId, studentData); // 实现这个函数
    });
    actionsDiv.appendChild(viewDetailsBtn);

    div.appendChild(infoDiv);
    div.appendChild(actionsDiv);
    return div;
}

function handleViewStudentDetails(studentId, studentData) {
    console.log(`查看学生详情: ID=${studentId}, 姓名=${studentData.name}`);

    // 确保模态框元素已获取且有效
    if (!textDisplayModal || !modalTitle || !modalTextContent) {
        console.error("文本显示模态框的DOM元素未找到或未正确获取！");
        alert("无法显示学生详情，界面组件缺失。");
        return;
    }

    if (studentData.ePortfolioText && typeof studentData.ePortfolioText === 'string') {
        modalTitle.textContent = `${studentData.name || "学生"} 的 E-Portfolio 报告`;
        if (typeof marked !== 'undefined' && marked.parse) { // 假设 marked.js 已在 teacher.html 引入
            try {
                modalTextContent.innerHTML = marked.parse(studentData.ePortfolioText);
            } catch (e) {
                console.error("Markdown parsing error:", e);
                modalTextContent.textContent = "Markdown内容解析错误。\n\n" + studentData.ePortfolioText;
            }
        } else {
            console.warn("Marked.js 未找到，将直接显示文本。");
            modalTextContent.textContent = studentData.ePortfolioText; // Fallback
        }
        textDisplayModal.style.display = 'block'; // 显示模态框
    } else {
        alert(`学生 ${studentData.name || studentId} 暂无 E-Portfolio 文本可供查看。`);
        console.log(`学生 ${studentData.name || studentId} 暂无 E-Portfolio 文本。`);
        // 如果没有内容，可以选择不显示模态框，或者显示提示信息
        modalTitle.textContent = `${studentData.name || "学生"} 的 E-Portfolio 报告`;
        modalTextContent.innerHTML = '<p style="text-align:center; color:#777;">该学生暂无E-Portfolio报告内容。</p>';
        textDisplayModal.style.display = 'block';
    }
}
// Initial call to set up based on default active tab (if needed, but CSS handles initial display)
// const initialActiveTab = document.querySelector('.teacher-tabs .tab-link.active');
// if (initialActiveTab) {
//     loadDataForTab(initialActiveTab.dataset.tab);