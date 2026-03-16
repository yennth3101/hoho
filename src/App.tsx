/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  BookOpen, 
  ClipboardCheck, 
  Send, 
  User, 
  GraduationCap, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  FileText,
  Image as ImageIcon,
  ChevronRight,
  Trophy,
  MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { generateCourseContent, evaluateResult, chatWithAI, AIContent, QuizQuestion } from './services/ai';
import { cn } from './lib/utils';
import Markdown from 'react-markdown';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

type WindowType = 'UPLOAD' | 'LECTURE' | 'QUIZ' | 'RESULT' | 'CHAT';
type Role = 'TEACHER' | 'STUDENT';

export default function App() {
  const [role, setRole] = useState<Role>('STUDENT');
  const [currentWindow, setCurrentWindow] = useState<WindowType>('LECTURE');
  const [isLoading, setIsLoading] = useState(false);
  const [courseData, setCourseData] = useState<AIContent | null>(null);
  const [studentInfo, setStudentInfo] = useState({ name: '', class: '' });
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizResult, setQuizResult] = useState<{ score: number; evaluation: string; feedback: string } | null>(null);
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('ai_tutor_course');
    const savedRawText = localStorage.getItem('ai_tutor_raw_text');
    if (savedData) {
      setCourseData(JSON.parse(savedData));
    }
    if (savedRawText) {
      setRawText(savedRawText);
    }
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setIsLoading(true);
    setError(null);
    let combinedText = rawText;

    try {
      for (const file of Array.from(files)) {
        if (file.type === 'application/pdf') {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          let text = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((item: any) => item.str).join(' ') + '\n';
          }
          combinedText += `\n[Nội dung từ PDF: ${file.name}]\n${text}`;
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          combinedText += `\n[Nội dung từ Word: ${file.name}]\n${result.value}`;
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer);
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const text = XLSX.utils.sheet_to_txt(sheet);
          combinedText += `\n[Nội dung từ Excel: ${file.name}]\n${text}`;
        } else if (file.type.startsWith('image/')) {
          combinedText += `\n[Tài liệu hình ảnh: ${file.name}]`;
        } else {
          const text = await file.text();
          combinedText += `\n[Nội dung từ Text: ${file.name}]\n${text}`;
        }
      }
      setRawText(combinedText);
      localStorage.setItem('ai_tutor_raw_text', combinedText);
    } catch (err) {
      setError('Lỗi khi đọc file. Vui lòng thử lại.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitCourse = async () => {
    if (!rawText.trim()) {
      setError('Vui lòng nhập nội dung hoặc tải tài liệu lên.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await generateCourseContent(rawText);
      setCourseData(result);
      localStorage.setItem('ai_tutor_course', JSON.stringify(result));
      localStorage.setItem('ai_tutor_raw_text', rawText);
      alert('Tạo bài giảng thành công!');
      setCurrentWindow('LECTURE');
    } catch (err) {
      setError('Lỗi khi tạo bài giảng từ AI. Vui lòng kiểm tra API Key.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || isChatLoading) return;

    const newMessage = { role: 'user' as const, text: userInput };
    setChatMessages(prev => [...prev, newMessage]);
    setUserInput('');
    setIsChatLoading(true);

    try {
      const history = chatMessages.map(m => ({ role: m.role, text: m.text }));
      const response = await chatWithAI(newMessage.text, rawText, history);
      setChatMessages(prev => [...prev, { role: 'ai', text: response }]);
    } catch (err) {
      console.error('Lỗi chat:', err);
      setChatMessages(prev => [...prev, { role: 'ai', text: 'Xin lỗi, đã có lỗi xảy ra khi kết nối với AI.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const submitQuiz = async () => {
    if (!studentInfo.name || !studentInfo.class) {
      alert('Vui lòng nhập đầy đủ thông tin sinh viên.');
      return;
    }

    if (Object.keys(quizAnswers).length < (courseData?.quiz.length || 0)) {
      if (!confirm('Bạn chưa trả lời hết các câu hỏi. Vẫn muốn nộp bài?')) return;
    }

    setIsLoading(true);
    try {
      let score = 0;
      courseData?.quiz.forEach((q, idx) => {
        if (quizAnswers[idx] === q.correctAnswer) {
          score++;
        }
      });

      const feedback = await evaluateResult(score, courseData?.quiz.length || 0, studentInfo.name);
      
      let evaluation = 'Cần ôn tập thêm';
      if (score >= 13) evaluation = 'Xuất sắc';
      else if (score >= 10) evaluation = 'Hiểu tốt';

      const result = { score, evaluation, feedback };
      setQuizResult(result);
      setCurrentWindow('RESULT');

      // Save to Google Sheets (Mocking the endpoint)
      // In a real app, you'd provide a Google Apps Script Web App URL
      const GOOGLE_SHEET_URL = import.meta.env.VITE_GOOGLE_SHEET_URL || process.env.VITE_GOOGLE_SHEET_URL;
      if (GOOGLE_SHEET_URL) {
        await fetch(GOOGLE_SHEET_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stt: Date.now(),
            name: studentInfo.name,
            class: studentInfo.class,
            score: `${score}/${courseData?.quiz.length}`,
            evaluation: evaluation
          })
        });
      }
    } catch (err) {
      console.error('Lỗi khi nộp bài:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Header / Navigation */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
              <GraduationCap size={24} />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              AI Tutor
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setRole(role === 'TEACHER' ? 'STUDENT' : 'TEACHER')}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                role === 'TEACHER' 
                  ? "bg-amber-100 text-amber-700 border border-amber-200" 
                  : "bg-indigo-100 text-indigo-700 border border-indigo-200"
              )}
            >
              {role === 'TEACHER' ? 'Chế độ Giảng viên' : 'Chế độ Sinh viên'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Role Warning for Students */}
        {role === 'STUDENT' && currentWindow === 'UPLOAD' && (
          <div className="bg-red-50 border border-red-200 p-6 rounded-2xl text-center">
            <AlertCircle className="mx-auto text-red-500 mb-2" size={48} />
            <h2 className="text-xl font-bold text-red-700">Truy cập bị từ chối</h2>
            <p className="text-red-600">Chỉ giảng viên mới có quyền truy cập cửa sổ này.</p>
            <button 
              onClick={() => setCurrentWindow('LECTURE')}
              className="mt-4 px-6 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
            >
              Quay lại bài giảng
            </button>
          </div>
        )}

        {/* Window 1: Upload (Teacher Only) */}
        {role === 'TEACHER' && (
          <div className="mb-8 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            <NavButton 
              active={currentWindow === 'UPLOAD'} 
              onClick={() => setCurrentWindow('UPLOAD')}
              icon={<Upload size={18} />}
              label="Tải tài liệu"
            />
            <NavButton 
              active={currentWindow === 'LECTURE'} 
              onClick={() => setCurrentWindow('LECTURE')}
              icon={<BookOpen size={18} />}
              label="Xem bài giảng"
            />
            <NavButton 
              active={currentWindow === 'CHAT'} 
              onClick={() => setCurrentWindow('CHAT')}
              icon={<MessageCircle size={18} />}
              label="Hỏi đáp AI"
            />
            <NavButton 
              active={currentWindow === 'QUIZ'} 
              onClick={() => setCurrentWindow('QUIZ')}
              icon={<ClipboardCheck size={18} />}
              label="Xem bài test"
            />
          </div>
        )}

        {/* Student Navigation (If course exists) */}
        {role === 'STUDENT' && courseData && (
          <div className="mb-8 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            <NavButton 
              active={currentWindow === 'LECTURE'} 
              onClick={() => setCurrentWindow('LECTURE')}
              icon={<BookOpen size={18} />}
              label="Bài giảng"
            />
            <NavButton 
              active={currentWindow === 'CHAT'} 
              onClick={() => setCurrentWindow('CHAT')}
              icon={<MessageCircle size={18} />}
              label="Hỏi đáp AI"
            />
            <NavButton 
              active={currentWindow === 'QUIZ'} 
              onClick={() => setCurrentWindow('QUIZ')}
              icon={<ClipboardCheck size={18} />}
              label="Bài test"
            />
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* WINDOW 1: UPLOAD */}
          {currentWindow === 'UPLOAD' && role === 'TEACHER' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <Upload className="text-indigo-600" /> Tải lên tài liệu giảng dạy
                </h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Dán nội dung văn bản</label>
                    <textarea 
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder="Nhập hoặc dán nội dung bài giảng tại đây..."
                      className="w-full h-48 p-4 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative group">
                      <input 
                        type="file" 
                        multiple 
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        accept=".pdf,.docx,.xlsx,.txt,.png,.jpg,.jpeg"
                      />
                      <div className="h-32 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center group-hover:border-indigo-400 group-hover:bg-indigo-50/50 transition-all">
                        <Upload className="text-slate-400 group-hover:text-indigo-500 mb-2" />
                        <span className="text-sm font-medium text-slate-500 group-hover:text-indigo-600">Chọn file tài liệu</span>
                        <span className="text-xs text-slate-400">PDF, Word, Excel, Image, Text</span>
                      </div>
                    </div>
                    
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                      <h3 className="text-sm font-bold text-slate-700 mb-2">Định dạng hỗ trợ:</h3>
                      <ul className="text-xs text-slate-500 space-y-1">
                        <li className="flex items-center gap-1"><FileText size={12}/> PDF & Word (.docx)</li>
                        <li className="flex items-center gap-1"><FileText size={12}/> Excel (.xlsx) & Text (.txt)</li>
                        <li className="flex items-center gap-1"><ImageIcon size={12}/> Hình ảnh (PNG, JPG)</li>
                      </ul>
                    </div>
                  </div>

                  {error && (
                    <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm flex items-center gap-2">
                      <AlertCircle size={16} /> {error}
                    </div>
                  )}

                  <button 
                    onClick={handleSubmitCourse}
                    disabled={isLoading}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                    GỬI TÀI LIỆU (SUBMIT)
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* WINDOW 2: LECTURE */}
          {currentWindow === 'LECTURE' && (
            <motion.div 
              key="lecture"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {!courseData ? (
                <div className="bg-white p-12 rounded-3xl shadow-sm border border-slate-200 text-center">
                  <BookOpen className="mx-auto text-slate-300 mb-4" size={64} />
                  <h2 className="text-2xl font-bold text-slate-400">Chưa có bài giảng nào</h2>
                  <p className="text-slate-400 mt-2">Giảng viên cần tải tài liệu lên để bắt đầu.</p>
                </div>
              ) : (
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                  <div className="prose prose-indigo max-w-none markdown-body">
                    <Markdown>{courseData.lecture}</Markdown>
                  </div>
                  
                  <div className="mt-12 pt-8 border-t border-slate-100 flex justify-center">
                    <button 
                      onClick={() => setCurrentWindow('QUIZ')}
                      className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2"
                    >
                      HOÀN THÀNH BÀI HỌC <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* WINDOW: CHAT */}
          {currentWindow === 'CHAT' && (
            <motion.div 
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-[600px] flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                <MessageCircle className="text-indigo-600" size={20} />
                <h2 className="font-bold text-slate-700">Hỏi đáp với AI Tutor</h2>
                <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">Dựa trên tài liệu bài học</span>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                {chatMessages.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageCircle className="text-slate-300" size={32} />
                    </div>
                    <p className="text-slate-400">Hãy đặt câu hỏi về nội dung bài học để AI giải đáp giúp bạn.</p>
                  </div>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={cn(
                    "flex",
                    msg.role === 'user' ? "justify-end" : "justify-start"
                  )}>
                    <div className={cn(
                      "max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed",
                      msg.role === 'user' 
                        ? "bg-indigo-600 text-white rounded-tr-none" 
                        : "bg-slate-100 text-slate-700 rounded-tl-none"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
                      <Loader2 className="animate-spin text-indigo-600" size={16} />
                      <span className="text-xs text-slate-500 font-medium">AI đang suy nghĩ...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-4 border-t border-slate-100 bg-white">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Nhập câu hỏi của bạn..."
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                  <button 
                    onClick={handleSendMessage}
                    disabled={isChatLoading || !userInput.trim()}
                    className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-100"
                  >
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* WINDOW 3: QUIZ */}
          {currentWindow === 'QUIZ' && (
            <motion.div 
              key="quiz"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
                  <ClipboardCheck className="text-indigo-600" /> Bài Kiểm Tra Đánh Giá
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Họ tên sinh viên</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        value={studentInfo.name}
                        onChange={(e) => setStudentInfo({...studentInfo, name: e.target.value})}
                        placeholder="Nguyễn Văn A"
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Tên lớp</label>
                    <div className="relative">
                      <GraduationCap className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        value={studentInfo.class}
                        onChange={(e) => setStudentInfo({...studentInfo, class: e.target.value})}
                        placeholder="Công nghệ thông tin K20"
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-12">
                  {courseData?.quiz.map((q, idx) => (
                    <div key={idx} className="space-y-4">
                      <h3 className="text-lg font-bold text-slate-800 flex gap-3">
                        <span className="flex-shrink-0 w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-sm">{idx + 1}</span>
                        {q.question}
                      </h3>
                      <div className="grid grid-cols-1 gap-3 ml-11">
                        {q.options.map((opt, optIdx) => {
                          const label = String.fromCharCode(65 + optIdx);
                          return (
                            <button 
                              key={optIdx}
                              onClick={() => setQuizAnswers({...quizAnswers, [idx]: label})}
                              className={cn(
                                "p-4 rounded-xl border text-left transition-all flex items-center gap-3",
                                quizAnswers[idx] === label 
                                  ? "bg-indigo-600 border-indigo-600 text-white shadow-md" 
                                  : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/30"
                              )}
                            >
                              <span className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                                quizAnswers[idx] === label ? "bg-white/20" : "bg-slate-100"
                              )}>
                                {label}
                              </span>
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-16 pt-8 border-t border-slate-100 flex justify-center">
                  <button 
                    onClick={submitQuiz}
                    disabled={isLoading}
                    className="px-12 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
                    NỘP BÀI
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* WINDOW: RESULT */}
          {currentWindow === 'RESULT' && quizResult && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 text-center">
                <div className="w-24 h-24 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trophy size={48} />
                </div>
                <h2 className="text-3xl font-bold mb-2">Kết Quả Bài Làm</h2>
                <p className="text-slate-500 mb-8">Chúc mừng {studentInfo.name} đã hoàn thành bài thi!</p>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
                    <span className="block text-sm font-bold text-indigo-600 uppercase tracking-wider mb-1">Điểm số</span>
                    <span className="text-4xl font-black text-indigo-700">{quizResult.score}/{courseData?.quiz.length}</span>
                  </div>
                  <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                    <span className="block text-sm font-bold text-emerald-600 uppercase tracking-wider mb-1">Đánh giá</span>
                    <span className="text-2xl font-black text-emerald-700">{quizResult.evaluation}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 text-left mb-8">
                  <h3 className="font-bold text-slate-700 mb-2">Nhận xét từ AI Tutor:</h3>
                  <p className="text-slate-600 italic leading-relaxed">"{quizResult.feedback}"</p>
                </div>

                <div className="space-y-4 text-left">
                  <h3 className="font-bold text-slate-800">Đáp án chi tiết:</h3>
                  {courseData?.quiz.map((q, idx) => (
                    <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-white flex items-start gap-3">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5",
                        quizAnswers[idx] === q.correctAnswer ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      )}>
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">{q.question}</p>
                        <p className="text-xs mt-1">
                          <span className="text-slate-400">Bạn chọn: {quizAnswers[idx] || 'Trống'}</span>
                          <span className="mx-2 text-slate-300">|</span>
                          <span className="text-emerald-600 font-bold">Đáp án đúng: {q.correctAnswer}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={() => {
                    setQuizAnswers({});
                    setQuizResult(null);
                    setCurrentWindow('LECTURE');
                  }}
                  className="mt-12 px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all"
                >
                  Quay lại bài giảng
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-200 mt-20">
        <div className="max-w-6xl mx-auto px-4 text-center text-slate-400 text-sm">
          <p>© 2026 AI Tutor System. Powered by Google Gemini API.</p>
        </div>
      </footer>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all whitespace-nowrap",
        active 
          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" 
          : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
