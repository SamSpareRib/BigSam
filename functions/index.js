// functions/index.js
const functions = require("firebase-functions");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { defineString } = require("firebase-functions/params");

const admin = require("firebase-admin");
let dbAdmin;

try {
    if (admin.apps.length === 0) {
        admin.initializeApp();
        functions.logger.info("Firebase Admin SDK (for default app) initialized successfully.");
    }
    dbAdmin = admin.firestore();
    functions.logger.info("Firestore Admin SDK initialized for THE DEFAULT database.");
} catch (e) {
    functions.logger.error(
        "CRITICAL: Error initializing Firebase Admin SDK or default Firestore instance:",
        e,
    );
}

const geminiApiKeyParam = defineString("GEMINI_APIKEY");

let genAI_instance = null;
let generativeModel_instance = null;
let globalInitializationError = null;

function ensureAiClientInitialized() {
  functions.logger.info(">>> ENTERING ensureAiClientInitialized");
  if (generativeModel_instance || globalInitializationError) {
    functions.logger.info(
      `ensureAiClientInitialized: Init attempt already made. Model: ${!!generativeModel_instance}, Error: ${globalInitializationError}`,
    );
    functions.logger.info("<<< EXITING ensureAiClientInitialized (already attempted)");
    return;
  }
  let apiKey = undefined;
  try {
    functions.logger.info("ensureAiClientInitialized: Attempting to get API key using geminiApiKeyParam.value()");
    apiKey = geminiApiKeyParam.value();
    functions.logger.info(`ensureAiClientInitialized: API key from param is: ${apiKey ? "****** (exists)" : "MISSING or EMPTY"}`);
    functions.logger.info(`ensureAiClientInitialized: Type of API key from param is: ${typeof apiKey}`);
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
      globalInitializationError = "Gemini API Key (GEMINI_APIKEY parameter) is missing, empty, or not a valid string.";
      functions.logger.error("ensureAiClientInitialized: " + globalInitializationError);
      functions.logger.info("<<< EXITING ensureAiClientInitialized (API key error)");
      return;
    }
    functions.logger.info("ensureAiClientInitialized: Proceeding to initialize GoogleGenerativeAI...");
    genAI_instance = new GoogleGenerativeAI(apiKey);
    generativeModel_instance = genAI_instance.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
    });
    functions.logger.info("ensureAiClientInitialized: Gemini AI Model lazily initialized successfully.");
  } catch (e) {
    globalInitializationError = `LAZY INIT FAILED in ensureAiClientInitialized: ${e.message}. APIKey used (type ${typeof apiKey}): ${apiKey ? "Exists" : "Missing"}`;
    functions.logger.error(globalInitializationError, e);
  }
  functions.logger.info("<<< EXITING ensureAiClientInitialized (finished attempt)");
}


exports.getAiFeedback = functions.https.onCall(async (data, context) => {
  functions.logger.info("--- getAiFeedback triggered ---");

  if (!dbAdmin) { // 确保 dbAdmin 已初始化
    functions.logger.error("CRITICAL: dbAdmin (DEFAULT Firestore instance) is not available.");
    return { role: "error", parts: [{ text: "AI Service Error: Database connection failure." }] };
  }

  ensureAiClientInitialized(); // 确保 Gemini 客户端已初始化

  if (globalInitializationError || !generativeModel_instance) {
    const errorMessage = globalInitializationError || "GenerativeModel is null/undefined.";
    functions.logger.error("getAiFeedback: AI client init issue.", { error: errorMessage });
    return { role: "error", parts: [{ text: `AI Service Initialization Error: ${errorMessage}` }] };
  }

  const actualPayload = data.data;
  functions.logger.info("getAiFeedback: Received payload:", JSON.stringify(actualPayload, null, 2));

  // --- 新增：获取 AI 任务类型 和 submissionId (如果提供了) ---
  const aiTaskType = actualPayload.aiTaskType || "dialogue"; // 默认为普通对话
  const submissionId = actualPayload.submissionId;
  // const userId = context.auth ? context.auth.uid : null; // userId 可能用于E-Portfolio用户特定上下文

  functions.logger.info(`AI Task Type: ${aiTaskType}, Submission ID: ${submissionId}`);


  // --- 根据 aiTaskType 选择不同逻辑 ---
  if (aiTaskType === "generateSingleTaskReport" || aiTaskType === "generateEportfolioText") {
    if (!submissionId) {
      functions.logger.error("Missing submissionId for report/eportfolio generation.");
      return { role: "error", parts: [{ text: "错误：生成报告或E-Portfolio需要 submissionId。" }] };
    }

    try {
      let specificPromptKey = "";
      let fallbackPromptText = "";

      if (aiTaskType === "generateSingleTaskReport") {
        specificPromptKey = "defaultSingleTaskReportPromptText";
        fallbackPromptText = "请根据以下对话历史，为学生总结本次任务的表现，并生成一份简洁的任务完成报告。报告应包括主要成就、待改进方面和具体建议。";
      } else { // generateEportfolioText
        specificPromptKey = "defaultEPortfolioGenerationPromptText";
        fallbackPromptText = "请根据以下对话历史和学生整体表现，生成一份E-Portfolio文本。这份文本应总结学生的学习进展，分析其写作能力（例如，在语言准确性、内容组织、观点表达等方面的表现），指出常见错误类型，并提供个性化的学习建议和未来目标。";
      }

      let generationPrompt = fallbackPromptText; // 使用后备Prompt作为默认值
      try {
        const configDocRef = dbAdmin.collection("settings").doc("globalPromptConfig");
        const configDocSnap = await configDocRef.get();
        if (configDocSnap.exists) {
          const configData = configDocSnap.data();
          if (configData && configData[specificPromptKey] && typeof configData[specificPromptKey] === 'string' && configData[specificPromptKey].trim() !== "") {
            generationPrompt = configData[specificPromptKey];
            functions.logger.info(`Successfully loaded '${specificPromptKey}' from Firestore:`, generationPrompt.substring(0, 100) + "...");
          } else {
            functions.logger.warn(`Firestore globalPromptConfig: '${specificPromptKey}' is missing or empty. Using fallback prompt.`);
          }
        } else {
          functions.logger.warn("globalPromptConfig document does not exist in Firestore. Using fallback prompt.");
        }
      } catch (error) {
        functions.logger.error(`Error reading '${specificPromptKey}' from Firestore. Using fallback prompt.`, error);
      }

      // 获取对话历史
      const chatsColRef = dbAdmin.collection("taskSubmissions").doc(submissionId).collection("chats");
      const chatsQuery = chatsColRef.orderBy("timestamp", "asc").limit(50); // 限制最近50条，避免超长
      const chatsSnapshot = await chatsQuery.get();
      let dialogueHistoryText = "对话历史摘要：\n";
      if (chatsSnapshot.empty) {
        dialogueHistoryText += "（本次任务没有对话记录或作文提交）\n";
      } else {
        chatsSnapshot.forEach(docSnap => { // Renamed doc to docSnap to avoid conflict
          const chatData = docSnap.data();
          const role = chatData.role === "user" ? "学生" : "AI助手";
          const messageText = chatData.parts && chatData.parts[0] ? chatData.parts[0].text : "(空)";
          dialogueHistoryText += `${role}: ${messageText.substring(0, 300)}\n`; // 限制每条消息长度
        });
      }
      functions.logger.info("Formatted dialogue history text length:", dialogueHistoryText.length);


      const fullPromptForGeneration = `${generationPrompt}\n\n以下是相关的对话历史和学生提交内容:\n${dialogueHistoryText}\n\n请基于以上所有信息，生成相应的文本：`;
      functions.logger.info("Sending to Gemini for generation (type: " + aiTaskType + "). Prompt length: " + fullPromptForGeneration.length);

      const result = await generativeModel_instance.generateContent(fullPromptForGeneration);
      const response = result.response;

      if (!response || typeof response.text !== 'function' || (response.candidates && response.candidates.length === 0 && !response.text())) {
        let reason = "AI未能生成内容。";
        if (response && response.promptFeedback && response.promptFeedback.blockReason) {
            reason = `由于安全设置 (${response.promptFeedback.blockReason})，AI未能生成内容。`;
        }
        functions.logger.error("Gemini generation failed or no usable text.", { responseDetails: JSON.stringify(response, null, 2) });
        return { role: "error", parts: [{ text: `AI错误: ${reason}` }] };
      }

      const generatedText = response.text();
      functions.logger.info(`Gemini successfully generated text (type: ${aiTaskType}):`, generatedText.substring(0, 200) + "...");

      return {
        role: "system_generated_text",
        type: aiTaskType,
        text: generatedText,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      functions.logger.error(`Error during ${aiTaskType} generation:`, error);
      return { role: "error", parts: [{ text: `生成 ${aiTaskType === "generateSingleTaskReport" ? "任务报告" : "E-Portfolio"} 时出错: ${error.message.substring(0,150)}` }] };
    }

  } else { // --- 普通对话逻辑 (aiTaskType === "dialogue" or default) ---
    if (!actualPayload || !actualPayload.messageText || typeof actualPayload.messageText !== "string" || actualPayload.messageText.trim() === "") {
      functions.logger.error("getAiFeedback (dialogue): Invalid messageText in payload.");
      return { role: "error", parts: [{ text: "错误：对话消息不能为空。" }] };
    }
    const userMessage = actualPayload.messageText;
    let systemPromptText = "你是一位乐于助人的智能写作辅导助手。请用简体中文回答，并保持鼓励和友好的语气。";
    try {
      const configDocRef = dbAdmin.collection("settings").doc("globalPromptConfig");
      const configDocSnap = await configDocRef.get();
      if (configDocSnap.exists) {
        const configData = configDocSnap.data();
        if (configData && configData.defaultSystemPromptText && typeof configData.defaultSystemPromptText === 'string' && configData.defaultSystemPromptText.trim() !== "") {
          systemPromptText = configData.defaultSystemPromptText;
          functions.logger.info("Successfully loaded system prompt for dialogue from Firestore.");
        } else {
          functions.logger.warn("Firestore globalPromptConfig: defaultSystemPromptText (for dialogue) is missing or empty. Using default.");
        }
      } else {
        functions.logger.warn("globalPromptConfig document does not exist. Using default system prompt for dialogue.");
      }
    } catch (error) {
      functions.logger.error("Error reading system prompt for dialogue. Using default.", error);
    }

    try {
      const chatHistoryForDialogue = [
        { role: "user", parts: [{text: systemPromptText}] },
        { role: "model", parts: [{text: "好的，我明白了。我会按照您的指示与您交流。"}] },
        // TODO: 对于普通对话，后续需要加载真实的最近对话历史 (例如最后 5-10轮)
        // 而不是每次都从头开始，或者仅依赖于这里的 systemPromptText
      ];
      const chat = generativeModel_instance.startChat({ history: chatHistoryForDialogue });
      functions.logger.info("Sending to Gemini (dialogue) with user message:", userMessage);
      const result = await chat.sendMessage(userMessage);
      const response = result.response;

      if (!response || typeof response.text !== 'function' || (response.candidates && response.candidates.length === 0 && !response.text())) {
          let reason = "AI未能生成有效对话回复。";
          if (response && response.promptFeedback && response.promptFeedback.blockReason) {
              reason = `由于安全设置 (${response.promptFeedback.blockReason})，AI未能生成回复。`;
          }
          functions.logger.error("Gemini dialogue generation failed or no usable text.", {responseDetails: JSON.stringify(response,null,2)});
          throw new functions.https.HttpsError("internal", reason); // 抛出 HttpsError 以便前端能更好处理
      }
      const aiText = response.text();
      functions.logger.info("Gemini AI dialogue response text:", aiText);
      return { role: "model", parts: [{text: aiText}], timestamp: new Date().toISOString() };

    } catch (error) {
      functions.logger.error("Error during dialogue with Gemini API:", error);
      // 如果已经是 HttpsError，直接重新抛出，否则包装一下
      if (error.code && error.httpErrorCode) { // HttpsError has code and httpErrorCode
          throw error;
      }
      throw new functions.https.HttpsError("internal", `AI对话时发生错误: ${error.message.substring(0,150)}`);
    }
  }
});

// 文件末尾空行