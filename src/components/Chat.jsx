import { useEffect, useState, useRef } from "react";
import { addDoc, collection, serverTimestamp, onSnapshot, query, where, orderBy } from 'firebase/firestore'
import { auth, db } from "../firebase-config"
import "../styles/Chat.css";
import { generateKeyFromPassword, encryptMessage, decryptMessage } from "../utils/crypto";

const REPLY_TAG_START = "||REPLY:";
const REPLY_TAG_END = "||";

function formatReply(user, originalText, newText) {
    try {
        return `${REPLY_TAG_START}${user}|${btoa(encodeURIComponent(originalText))}${REPLY_TAG_END}${newText}`;
    } catch(e) {
        return newText;
    }
}

function parseMessageText(text) {
    if (typeof text === 'string' && text.startsWith(REPLY_TAG_START)) {
        const endIdx = text.indexOf(REPLY_TAG_END, REPLY_TAG_START.length);
        if (endIdx > -1) {
            const dataStr = text.substring(REPLY_TAG_START.length, endIdx);
            const messageBody = text.substring(endIdx + REPLY_TAG_END.length);
            const splitIdx = dataStr.indexOf('|');
            if (splitIdx > -1) {
                const user = dataStr.substring(0, splitIdx);
                const encodedText = dataStr.substring(splitIdx + 1);
                let originalText = "";
                try {
                    originalText = decodeURIComponent(atob(encodedText));
                } catch(e) {
                    originalText = "Invalid text";
                }
                return { isReply: true, replyUser: user, replyText: originalText, text: messageBody };
            }
        }
    }
    return { isReply: false, text: typeof text === 'string' ? text : '' };
}

export const Chat = (props) => {
    const { room, roomPassword } = props;
    const [newMessage, setNewMessage] = useState("")
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [cryptoKey, setCryptoKey] = useState(null);
    const [replyingTo, setReplyingTo] = useState(null);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const messagesRef = collection(db, "messages");

    // Derive key when room or password changes
    useEffect(() => {
        const initKey = async () => {
            if (roomPassword) {
                try {
                    const key = await generateKeyFromPassword(roomPassword, room);
                    setCryptoKey(key);
                } catch (err) {
                    console.error("Key generation failed:", err);
                    setError("Failed to generate encryption key");
                }
            } else {
                setCryptoKey(null);
            }
        };
        initKey();
    }, [room, roomPassword]);

    useEffect(() => {
        setLoading(true);
        setError(null);

        const queryMessages = query(
            messagesRef,
            where("room", "==", room),
            orderBy("createdAt")
        );

        const unsuscribe = onSnapshot(
            queryMessages,
            (snapshot) => {
                let messages = [];
                const processMessages = async () => {
                    for (const doc of snapshot.docs) {
                        const data = doc.data();
                        let text = data.text;
                        let isEncrypted = false;

                        // Try to decrypt if we have a key and it looks like JSON
                        if (cryptoKey && text.startsWith('{') && text.includes('"iv":')) {
                            const decrypted = await decryptMessage(text, cryptoKey);
                            if (decrypted) {
                                text = decrypted;
                                isEncrypted = true;
                            } else {
                                text = "🔒 Encrypted Message (Wrong Password)";
                            }
                        } else if (text.startsWith('{') && text.includes('"iv":')) {
                            text = "🔒 Encrypted Message (Password Required)";
                        }

                        messages.push({ ...data, id: doc.id, text, isEncrypted });
                    }
                    setMessages(messages);
                    setLoading(false);
                    setError(null);
                };
                processMessages();
            },
            (error) => {
                console.error("Firestore error:", error);
                setError(
                    <div className="flex flex-col gap-2 w-full pr-4 text-xs">
                        <p className="font-medium text-red-300">Firestore Index Required</p>
                        <p className="opacity-80 break-all">{error.message}</p>
                        <p className="mt-2 opacity-90 font-medium pb-1">
                            👆 Please copy the URL provided in the error message above, paste it into your browser, and click "Create Index". It will take 2-3 minutes to build.
                        </p>
                    </div>
                );
                setLoading(false);
            }
        );

        return () => unsuscribe();
    }, [room, cryptoKey]); // Re-run when key changes to re-decrypt

    const handleSubmit = async (e) => {
        e.preventDefault();

        const trimmedMessage = newMessage.trim();
        if (trimmedMessage === "") {
            setNewMessage("");
            return;
        }

        if (!auth.currentUser) {
            setError("User not authenticated");
            return;
        }

        try {
            let finalPlaintext = trimmedMessage;
            if (replyingTo) {
                finalPlaintext = formatReply(replyingTo.user, replyingTo.text, trimmedMessage);
            }

            let messageText = finalPlaintext;
            if (cryptoKey) {
                messageText = await encryptMessage(finalPlaintext, cryptoKey);
            }

            await addDoc(messagesRef, {
                text: messageText,
                createdAt: serverTimestamp(),
                user: auth.currentUser.displayName || "Anonymous",
                room,
                userId: auth.currentUser.uid // Add user ID for better identification
            });
            setNewMessage("");
            setReplyingTo(null);
            setError(null);
        } catch (error) {
            console.error("Error sending message:", error);
            setError("Failed to send message: " + error.message);
        }
    }

    // Check if message is from current user
    const isCurrentUser = (messageUser) => {
        return auth.currentUser &&
            (messageUser === auth.currentUser.displayName ||
                messageUser === auth.currentUser.email);
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full w-full bg-transparent">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400 mb-4 shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                <p className="text-indigo-200/50 font-light tracking-widest text-xs uppercase text-center mt-2">Loading secure messages...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-transparent w-full relative">
            {/* Error Message */}
            {error && (
                <div className="absolute top-4 left-4 right-4 bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl shadow-lg backdrop-blur-md z-20 flex items-center gap-3">
                    <svg className="w-5 h-5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span className="text-xs font-light tracking-wide">{error}</span>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
                {messages.length === 0 && !error ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 text-white/50">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10 shadow-inner">
                            <svg className="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                        </div>
                        <p className="font-light tracking-wider text-lg text-white/80 mb-1">No messages yet</p>
                        <p className="text-xs font-light text-white/40">Be the first to start the secure conversation!</p>
                    </div>
                ) : (
                    messages.map((message) => {
                        const isSender = isCurrentUser(message.user);
                        const parsedBody = parseMessageText(message.text);
                        const displayOriginalText = parsedBody.isReply ? parsedBody.text : message.text;

                        const handleReplyClick = () => {
                            setReplyingTo({
                                id: message.id,
                                user: message.user,
                                text: displayOriginalText
                            });
                        };

                        const handleCopy = () => {
                            navigator.clipboard.writeText(displayOriginalText).catch(err => {
                                console.error('Failed to copy message:', err);
                            });
                        };

                        return (
                            <div key={message.id} className={`flex w-full group/msg ${isSender ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex flex-col max-w-[80%] md:max-w-[70%] ${isSender ? 'items-end' : 'items-start'}`}>
                                    <div className={`flex items-center gap-2 mb-1.5 w-full ${isSender ? 'justify-end' : 'justify-start'}`}>
                                        {!isSender && (
                                            <span className="text-[10px] font-medium tracking-wider uppercase text-white/50 ml-2">{message.user}</span>
                                        )}
                                        <div className={`opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-1.5 ${isSender ? 'mr-1 flex-row-reverse' : 'ml-1'}`}>
                                            <button onClick={handleReplyClick} title="Reply" className="p-1 text-white/40 hover:text-indigo-300 transition-colors rounded-md hover:bg-white/5">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg>
                                            </button>
                                            <button onClick={handleCopy} title="Copy Text" className="p-1 text-white/40 hover:text-indigo-300 transition-colors rounded-md hover:bg-white/5">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div 
                                        className={`px-4 py-3 rounded-2xl shadow-sm relative group backdrop-blur-md flex flex-col w-full
                                        ${isSender 
                                            ? 'bg-indigo-500/20 text-indigo-100 border border-indigo-400/30 rounded-br-sm'
                                            : 'bg-white/5 text-white/90 border border-white/10 rounded-bl-sm'
                                        }`}
                                    >
                                        {parsedBody.isReply && (
                                            <div className={`mb-2 p-2 rounded-lg text-xs border-l-2 ${isSender ? 'bg-indigo-900/40 border-indigo-400/50' : 'bg-black/20 border-white/20'} max-h-20 overflow-y-auto custom-scrollbar`}>
                                                <div className="font-medium opacity-70 mb-0.5">{parsedBody.replyUser}</div>
                                                <div className="opacity-60 whitespace-pre-wrap">{parsedBody.replyText}</div>
                                            </div>
                                        )}
                                        <p className="text-[15px] font-light leading-relaxed break-words whitespace-pre-wrap">{parsedBody.text}</p>
                                    </div>
                                    {message.createdAt && (
                                        <span className={`text-[10px] text-white/30 mt-1.5 font-light tracking-wide ${isSender ? 'mr-2' : 'ml-2'}`}>
                                            {new Date(message.createdAt.seconds * 1000).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                            {message.isEncrypted && <span className="ml-1.5 opacity-50 text-[9px]">🔒</span>}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-black/20 border-t border-white/10 p-4 backdrop-blur-xl z-10 w-full shrink-0 flex flex-col">
                {replyingTo && (
                    <div className="mb-3 px-4 py-2 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between text-xs mx-1">
                        <div className="flex flex-col overflow-hidden mr-4">
                            <span className="text-indigo-400 font-medium mb-0.5">Replying to {replyingTo.user}</span>
                            <span className="text-white/60 truncate">{replyingTo.text}</span>
                        </div>
                        <button 
                            type="button" 
                            onClick={() => setReplyingTo(null)}
                            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-white shrink-0"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                )}
                <form onSubmit={handleSubmit} className="flex gap-3 w-full relative">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="flex-1 bg-black/40 border border-white/10 rounded-2xl py-3.5 px-5 mx-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 focus:bg-black/60 transition-all text-[15px] text-white placeholder-white/30 font-light"
                        placeholder="Type a secure message..."
                        maxLength={500}
                        disabled={!!error}
                    />
                    <button 
                        type="submit" 
                        disabled={!newMessage.trim() || !!error}
                        className="bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-200 border border-indigo-500/30 rounded-2xl p-3.5 px-6 font-medium tracking-wide flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(0,0,0,0.1)] focus:outline-none focus:ring-1 focus:ring-indigo-400 shrink-0"
                    >
                        Send
                    </button>
                </form>
            </div>
        </div>
    );
};