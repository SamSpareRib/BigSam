// 从 firebase-init.js 导入 auth 实例和 Firestore db 实例 (db 暂时不用，但后续可能需要)
import { auth, db } from './firebase-init.js';
// 导入 Firebase Auth 模块中需要的函数
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile // 用于更新用户姓名
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"; // 确保版本号与 firebase-init.js 一致

import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 获取 DOM 元素
const loginContainer = document.getElementById('login-container');
const registerContainer = document.getElementById('register-container');
const userInfoContainer = document.getElementById('user-info-container');

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

const logoutButton = document.getElementById('logout-button');
const userEmailDisplay = document.getElementById('user-email');

const showRegisterLink = document.getElementById('show-register-link');
const showLoginLink = document.getElementById('show-login-link');

const loginErrorP = document.getElementById('login-error');
const registerErrorP = document.getElementById('register-error');

// --- 表单切换逻辑 ---
if (showRegisterLink) {
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginContainer.style.display = 'none';
        registerContainer.style.display = 'block';
        loginErrorP.textContent = ''; // 清空错误信息
    });
}

if (showLoginLink) {
    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerContainer.style.display = 'none';
        loginContainer.style.display = 'block';
        registerErrorP.textContent = ''; // 清空错误信息
    });
}


// --- Firebase Auth 监听器 ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // 用户已登录
        console.log("用户已登录:", user);
        if (userEmailDisplay) userEmailDisplay.textContent = user.email; // 显示用户邮箱

        // 根据当前页面决定是否跳转或更新UI
        if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
            // 如果在登录页，可以跳转到 chat.html
            // 或者直接隐藏登录/注册表单，显示用户信息
            if (loginContainer) loginContainer.style.display = 'none';
            if (registerContainer) registerContainer.style.display = 'none';
            if (userInfoContainer) userInfoContainer.style.display = 'block';
            // 暂时不强制跳转，允许用户在首页看到自己已登录并可以选择退出
            // window.location.href = 'chat.html'; //  如果希望登录后直接跳转，取消此行注释
        } else if (window.location.pathname.endsWith('chat.html')) {
            // 如果已经在 chat.html, 可能需要更新 chat.html 内的用户信息展示
            // (chat.html 的逻辑我们后面再写)
        }

    } else {
        // 用户未登录或已退出
        console.log("用户未登录");
        if (userEmailDisplay) userEmailDisplay.textContent = '';
        if (userInfoContainer) userInfoContainer.style.display = 'none';

        // 如果用户在需要登录的页面（如 chat.html）但未登录，则跳转回登录页
        if (window.location.pathname.endsWith('chat.html')) {
            window.location.href = 'index.html';
        } else {
            // 在 index.html, 确保登录表单显示
            if (loginContainer) loginContainer.style.display = 'block';
            if (registerContainer) registerContainer.style.display = 'none'; // 默认隐藏注册
        }
    }
});


// --- 注册逻辑 ---
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerErrorP.textContent = ''; // 清空之前的错误信息

        const name = registerForm['register-name'].value;
        const email = registerForm['register-email'].value;
        const password = registerForm['register-password'].value;
        const confirmPassword = registerForm['register-confirm-password'].value;

        if (password !== confirmPassword) {
            registerErrorP.textContent = "两次输入的密码不匹配！";
            return;
        }
        if (password.length < 6) {
            registerErrorP.textContent = "密码长度至少为6位！"; // Firebase 默认要求
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log("注册成功:", user);

            // 更新用户资料 (姓名)
            await updateProfile(user, {
                displayName: name
            });
            console.log("用户资料更新成功，姓名为:", name);

            // --- 将用户信息保存到 Firestore ---
            try {
                // 使用 user.uid 作为 Firestore users 集合中文档的ID
                const userDocRef = doc(db, "users", user.uid);
                await setDoc(userDocRef, {
                    uid: user.uid, // 用户在 Authentication 中的唯一ID
                    name: name,    // 从表单获取的姓名
                    email: user.email, // 用户邮箱
                    role: "user",  // 默认为普通学生用户 "user"
                    createdAt: serverTimestamp(), // 使用 Firestore 服务器时间戳记录创建时间
                    // 根据您的文档，未来可能还有：
                    // gender: formGenderValue, // 需要从表单获取
                    // collegeId: formCollegeIdValue,
                    // majorId: formMajorIdValue,
                    // studentClassId: formStudentClassIdValue,
                    // studentId: formStudentIdValue,
                    // ePortfolioSummaryText: "", // 初始 E-Portfolio 摘要可以为空
                    // ePortfolioData: { // 初始的结构化 E-Portfolio 数据
                    //     averageTaskScore: 0,
                    //     completedTasksCount: 0,
                    //     writingSkills: { languageAccuracy: 0, structureCohesion: 0 },
                    //     rankTitle: "写作新手"
                    // }
                });
                console.log("用户信息已成功保存到 Firestore，文档ID:", user.uid);
            } catch (firestoreError) {
                console.error("保存用户信息到 Firestore 失败:", firestoreError);
                // 即使用户信息保存到 Firestore 失败，Auth 注册仍然是成功的
                // 这里可以考虑是否要提示用户，或者记录更详细的错误供排查
                // 为了不中断注册流程，我们可以只记录错误
                // 如果非常关键，也可以考虑回滚 Auth 用户创建 (较复杂)
                registerErrorP.textContent = "账户创建成功，但保存附加信息时出错。请稍后尝试更新个人资料或联系管理员。";
                // 不在这里 return，让用户继续完成注册流程
            }


            alert(`注册成功！欢迎 ${name}！现在将跳转到主应用页面。`); // 简单提示
            // 注册成功后，onAuthStateChanged 会检测到用户状态变化，自动处理UI更新或跳转
            // 如果 onAuthStateChanged 没有立即跳转的逻辑，可以在这里手动跳转
            window.location.href = 'chat.html'; // 注册成功后跳转到学生端

        } catch (error) {
            console.error("注册失败:", error);
            let errorMessage = "注册失败，请稍后重试。";
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "该邮箱已被注册！";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "密码强度太弱！";
            } else if (error.code) {
                errorMessage = error.message; // Firebase 提供的错误信息
            }
            registerErrorP.textContent = errorMessage;
        }
    });
}


// --- 登录逻辑 ---
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginErrorP.textContent = '';

        const email = loginForm['login-email'].value;
        const password = loginForm['login-password'].value;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log("登录成功:", user);
            
            const adminEmail = "admin@admin.com";
            const teacherTestEmail = "playstreetball@125.com";
            // --- 新增/修改：根据角色或特定用户跳转 ---
            if (user.email === "admin@admin.com") { // 替换为您的真实管理员测试邮箱
                alert(`管理员 ${user.displayName || user.email} 登录成功！正在跳转到管理后台。`);
                window.location.href = 'admin.html';
            } else if (user.email === teacherTestEmail) { 
                alert(`教师 ${user.displayName || user.email} 登录成功！正在跳转到教师后台。`);
                window.location.href = 'teacher.html';
            } else {
                // 假设其他都是学生用户 (后续会根据 Firestore 中的 role 字段改进)
                alert(`登录成功！欢迎回来 ${user.displayName || user.email}！现在将跳转到主应用页面。`);
                window.location.href = 'chat.html';
            }
            // --- 结束新增/修改 ---

        } catch (error) {
            console.error("登录失败:", error);
            let errorMessage = "登录失败，请检查您的邮箱和密码。";
             if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                errorMessage = "邮箱或密码错误！";
            } else if (error.code) {
                errorMessage = error.message;
            }
            loginErrorP.textContent = errorMessage;
        }
    });
}

// --- 退出逻辑 ---
if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
            console.log("退出成功");
            // onAuthStateChanged 会检测到用户状态变化，并处理跳转到 index.html (如果当前不在 index.html)
            // 或更新 index.html 上的 UI
            // 如果 onAuthStateChanged 逻辑不足以确保在任何页面退出都返回登录页，可以在此强制跳转
            if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
                 window.location.href = 'index.html';
            }

        } catch (error) {
            console.error("退出失败:", error);
            alert("退出失败：" + error.message);
        }
    });
}