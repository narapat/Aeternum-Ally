import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Bot, HelpCircle, AlertTriangle, Sparkles, Loader2 } from 'lucide-react';

interface AllyAssistantProps {
  userEmail?: string;
  companyName?: string;
  userRole?: string;
}

export const AllyAssistant: React.FC<AllyAssistantProps> = ({ userEmail, companyName, userRole }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [rel, setRel] = useState({ x: 0, y: 0 });
  const bubbleRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant', text: string }>>([
    { role: 'assistant', text: "Hi! I'm **Ally**. How can I help you today?\n\nYou can also refer to the [User Manual](https://github.com/narapat/Aeternum-Ally/blob/main/Docs%20v1.1.0/USER_MANUAL.md) for guidance!" }
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Initialize position to bottom right
  useEffect(() => {
    setPosition({
      x: window.innerWidth - 80,
      y: window.innerHeight - 80
    });
  }, []);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isOpen) return; // Only drag when closed and left click
    setIsDragging(true);
    const rect = bubbleRef.current?.getBoundingClientRect();
    if (rect) {
      setRel({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
    e.stopPropagation();
    e.preventDefault();
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      // Calculate new position
      let newX = e.clientX - rel.x;
      let newY = e.clientY - rel.y;
      
      // Keep within boundaries
      newX = Math.max(0, Math.min(newX, window.innerWidth - 60));
      newY = Math.max(0, Math.min(newY, window.innerHeight - 60));
      
      setPosition({ x: newX, y: newY });
    };

    const onMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, rel]);

  const handleSendMessage = async (textToSend = inputText) => {
    if (!textToSend.trim()) return;

    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setInputText("");
    setIsLoading(true);

    try {
      const response = await fetch('/.netlify/functions/ally-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', text: textToSend }],
          context: window.location.pathname,
          errors: '',
          userInfo: {
            email: userEmail,
            company: companyName,
            role: userRole
          }
        })
      });

      const data = await response.json();
      if (response.ok) {
        setMessages(prev => [...prev, { role: 'assistant', text: data.response }]);
      } else {
        const errorMsg = data.details?.message || data.error || "Sorry, I encountered an error. Please try again.";
        setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${errorMsg}` }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', text: "Sorry, I couldn't connect to the support service." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReportIssue = () => {
    handleSendMessage("I want to report an issue or give feedback.");
  };

  const renderMessageText = (text: string, isUser: boolean) => {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      parts.push(
        <a 
          key={match.index} 
          href={match[2]} 
          target="_blank" 
          rel="noopener noreferrer"
          className={isUser ? "underline hover:text-emerald-100 font-semibold" : "text-emerald-600 dark:text-emerald-400 underline hover:text-emerald-700 dark:hover:text-emerald-300 font-semibold"}
        >
          {match[1]}
        </a>
      );
      lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <>
      {/* Floating Bubble */}
      <div
        ref={bubbleRef}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 9999,
          cursor: isDragging ? 'grabbing' : 'grab',
          transition: isDragging ? 'none' : 'all 0.1s ease',
        }}
        onMouseDown={onMouseDown}
        onClick={() => {
          if (!isDragging) setIsOpen(true);
        }}
        className={`${
          isOpen ? 'hidden' : 'flex'
        } w-14 h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full items-center justify-center shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200`}
      >
        <Bot className="w-6 h-6" />
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
        </span>
      </div>

      {/* Expanded Chat Window */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            zIndex: 9999,
          }}
          className="w-80 sm:w-96 h-[500px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-700 overflow-hidden"
        >
          {/* Header */}
          <div className="bg-emerald-600 p-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Ally Assistant</h3>
                <p className="text-xs text-emerald-100">Always here to help</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-emerald-100 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto bg-slate-50 dark:bg-slate-900 space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2 items-start ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user' ? 'bg-slate-300 dark:bg-slate-600' : 'bg-emerald-100 dark:bg-emerald-900'
                }`}>
                  {msg.role === 'user' ? (
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-200">U</span>
                  ) : (
                    <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                </div>
                <div className={`p-3 rounded-lg border shadow-sm max-w-[80%] ${
                  msg.role === 'user' 
                    ? 'bg-emerald-600 text-white border-emerald-500 rounded-tr-none' 
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-100 dark:border-slate-700 rounded-tl-none'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{renderMessageText(msg.text, msg.role === 'user')}</p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2 items-start">
                <div className="w-6 h-6 bg-emerald-100 dark:bg-emerald-900 rounded-full flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="bg-white dark:bg-slate-800 p-3 rounded-lg rounded-tl-none border border-slate-100 dark:border-slate-700 shadow-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />

            {/* Quick Actions (only show if few messages) */}
            {messages.length <= 1 && (
              <div className="grid grid-cols-1 gap-2 mt-2">
                <button 
                  onClick={() => handleSendMessage("How to use this page?")}
                  className="flex items-center gap-2 p-2.5 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors text-left"
                >
                  <HelpCircle className="w-4 h-4 text-emerald-500" />
                  <span>How to use this page?</span>
                </button>
                <button 
                  onClick={handleReportIssue}
                  className="flex items-center gap-2 p-2.5 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors text-left"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>Report an issue</span>
                </button>
                <button 
                  onClick={() => handleSendMessage("What is double materiality?")}
                  className="flex items-center gap-2 p-2.5 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors text-left"
                >
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <span>What is double materiality?</span>
                </button>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type your question..."
                className="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                disabled={isLoading}
              />
              <button 
                onClick={() => handleSendMessage()}
                disabled={isLoading || !inputText.trim()}
                className="w-10 h-10 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AllyAssistant;
