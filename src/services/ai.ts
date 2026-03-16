import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
}

export interface AIContent {
  lecture: string;
  quiz: QuizQuestion[];
}

export async function generateCourseContent(rawContent: string): Promise<AIContent> {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          lecture: {
            type: Type.STRING,
            description: "Detailed lecture content in Markdown format including explanation, examples, key concepts, and summary.",
          },
          quiz: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "Exactly 4 options: A, B, C, D"
                },
                correctAnswer: { 
                  type: Type.STRING,
                  description: "The correct option (e.g., 'A', 'B', 'C', or 'D')"
                },
              },
              required: ["question", "options", "correctAnswer"],
            },
          },
        },
        required: ["lecture", "quiz"],
      },
    },
    contents: [
      {
        parts: [
          {
            text: `Bạn là một trợ lý giảng dạy đại học. Hãy đọc nội dung sau và tạo một bài giảng chi tiết (Markdown) và 15 câu hỏi trắc nghiệm. 
            Bài giảng phải có: 1. Giải thích chi tiết, 2. Ví dụ minh họa, 3. Khái niệm quan trọng, 4. Tóm tắt.
            Câu hỏi trắc nghiệm phải có 4 đáp án A, B, C, D và 1 đáp án đúng.
            Nội dung tài liệu: ${rawContent}`,
          },
        ],
      },
    ],
  });

  const response = await model;
  return JSON.parse(response.text || "{}") as AIContent;
}

export async function evaluateResult(score: number, total: number, studentName: string): Promise<string> {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: `Hãy đưa ra một nhận xét cá nhân ngắn gọn, công bằng và khích lệ cho sinh viên ${studentName} vừa đạt điểm ${score}/${total} trong bài kiểm tra. 
            Dựa trên điểm số để đánh giá (Xuất sắc, Hiểu tốt, Cần ôn tập thêm). Đừng lặp lại các câu mẫu cũ.`,
          },
        ],
      },
    ],
  });

  const response = await model;
  return response.text || "Chúc mừng bạn đã hoàn thành bài học!";
}

export async function chatWithAI(message: string, context: string, history: { role: string, text: string }[]): Promise<string> {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `Bạn là một AI Tutor. Bạn chỉ được phép trả lời các câu hỏi dựa trên nội dung tài liệu được cung cấp dưới đây. 
      Nếu câu hỏi không liên quan đến tài liệu, hãy lịch sự từ chối và yêu cầu sinh viên hỏi về nội dung bài học.
      Nội dung tài liệu: ${context}`,
    },
    contents: [
      ...history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      })),
      {
        role: 'user',
        parts: [{ text: message }]
      }
    ],
  });

  const response = await model;
  return response.text || "Xin lỗi, tôi không thể trả lời câu hỏi này.";
}
