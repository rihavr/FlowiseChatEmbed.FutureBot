import {createSignal, createEffect, For, onMount, Show, mergeProps, on, createMemo, onCleanup} from 'solid-js';
import {v4 as uuidv4} from 'uuid';
import {sendMessageQuery, isStreamAvailableQuery, IncomingInput, getChatbotConfig} from '@/queries/sendMessageQuery';
import {TextInput} from './inputs/textInput';
import {GuestBubble} from './bubbles/GuestBubble';
import {BotBubble} from './bubbles/BotBubble';
import {LoadingBubble} from './bubbles/LoadingBubble';
import {SourceBubble} from './bubbles/SourceBubble';
import {StarterPromptBubble} from './bubbles/StarterPromptBubble';
import {BotMessageTheme, TextInputTheme, UserMessageTheme, FeedbackTheme} from '@/features/bubble/types';
import {Badge} from './Badge';
import socketIOClient from 'socket.io-client';
import {Popup} from '@/features/popup';
import {Avatar} from '@/components/avatars/Avatar';
import {DeleteButton, SendButton} from '@/components/buttons/SendButton';
import {CircleDotIcon, TrashIcon} from './icons';
import {CancelButton} from './buttons/CancelButton';
import {cancelAudioRecording, startAudioRecording, stopAudioRecording} from '@/utils/audioRecording';
import { LeadCaptureBubble } from '@/components/bubbles/LeadCaptureBubble';
import { removeLocalStorageChatHistory, getLocalStorageChatflow, setLocalStorageChatflow } from '@/utils';

export type FileEvent<T = EventTarget> = {
    target: T;
};

export type FormEvent<T = EventTarget> = {
    preventDefault: () => void;
    currentTarget: T;
};

type ImageUploadConstraits = {
    fileTypes: string[];
    maxUploadSize: number;
};

export type UploadsConfig = {
    imgUploadSizeAndTypes: ImageUploadConstraits[];
    isImageUploadAllowed: boolean;
    isSpeechToTextEnabled: boolean;
};

type FilePreviewData = string | ArrayBuffer;

type FilePreview = {
    data: FilePreviewData;
    mime: string;
    name: string;
    preview: string;
    type: string;
};

type messageType = 'apiMessage' | 'userMessage' | 'usermessagewaiting' | 'leadCaptureMessage';

export type FileUpload = Omit<FilePreview, 'preview'>;

export type MessageType = {
    messageId?: string;
    message: string;
    type: messageType;
    sourceDocuments?: any;
    fileAnnotations?: any;
    fileUploads?: Partial<FileUpload>[];
};

type observerConfigType = (accessor: string | boolean | object | MessageType[]) => void;
export type observersConfigType = Record<'observeUserInput' | 'observeLoading' | 'observeMessages', observerConfigType>;

export type BotProps = {
    chatflowid: string;
    apiHost?: string;
    chatflowConfig?: Record<string, unknown>;
    welcomeMessage?: string;
    errorMessage?: string;
    botMessage?: BotMessageTheme;
    userMessage?: UserMessageTheme;
    textInput?: TextInputTheme;
    feedback?: FeedbackTheme;
    poweredByTextColor?: string;
    badgeBackgroundColor?: string;
    bubbleBackgroundColor?: string;
    bubbleTextColor?: string;
    showTitle?: boolean;
    title?: string;
    titleAvatarSrc?: string;
    fontSize?: number;
    isFullPage?: boolean;
    observersConfig?: observersConfigType;
};

export type LeadsConfig = {
    status: boolean;
    title?: string;
    name?: boolean;
    email?: boolean;
    phone?: boolean;
    successMessage?: string;
};

const defaultWelcomeMessage = 'Hi there! How can I help?';

const defaultBackgroundColor = '#ffffff';
const defaultTextColor = '#303235';

let isTyping = false;
const eventListeners = [];

export const setIsTyping = (value) => {
    if (isTyping !== value) {
        isTyping = value;
        eventListeners.forEach((fn) => fn(value));
    }
};

export const getIsTyping = () => {
    return isTyping;
};

export const addIsTypingListener = (fn) => {
    eventListeners.push(fn);
};

export const removeIsTypingListener = (fn) => {
    const index = eventListeners.indexOf(fn);
    if (index > -1) {
        eventListeners.splice(index, 1);
    }
};

window.onerror = function (message, source, lineno, colno, error) {
    console.error('An error occurred:', {message, source, lineno, colno, error});
};

window.onunhandledrejection = function (event) {
    console.error('Unhandled rejection:', event.reason);
};

export const Bot = (botProps: BotProps & { class?: string }) => {
    // set a default value for showTitle if not set and merge with other props
    const props = mergeProps({showTitle: false}, botProps);
    let chatContainer: HTMLDivElement | undefined;
    let bottomSpacer: HTMLDivElement | undefined;
    let botContainer: HTMLDivElement | undefined;

    const [userInput, setUserInput] = createSignal('');
    const [loading, setLoading] = createSignal(false);
    const [sourcePopupOpen, setSourcePopupOpen] = createSignal(false);
    const [sourcePopupSrc, setSourcePopupSrc] = createSignal({});
    const [messages, setMessages] = createSignal<MessageType[]>(
        [
            {
                message: props.welcomeMessage ?? defaultWelcomeMessage,
                type: 'apiMessage',
            },
        ],
        {equals: false},
    );
    const [socketIOClientId, setSocketIOClientId] = createSignal('');
    const [isChatFlowAvailableToStream, setIsChatFlowAvailableToStream] = createSignal(false);
    const [chatId, setChatId] = createSignal(
        (props.chatflowConfig?.vars as any)?.customerId ? `${(props.chatflowConfig?.vars as any).customerId.toString()}+${uuidv4()}` : uuidv4(),
    );
    const [starterPrompts, setStarterPrompts] = createSignal<string[]>([], {equals: false});
    const [chatFeedbackStatus, setChatFeedbackStatus] = createSignal<boolean>(false);
    const [uploadsConfig, setUploadsConfig] = createSignal<UploadsConfig>();
    const [leadsConfig, setLeadsConfig] = createSignal<LeadsConfig>();
    const [isLeadSaved, setIsLeadSaved] = createSignal(false);
    const [leadEmail, setLeadEmail] = createSignal('');

    // drag & drop file input
    // TODO: fix this type
    const [previews, setPreviews] = createSignal<FilePreview[]>([]);

    // audio recording
    const [elapsedTime, setElapsedTime] = createSignal('00:00');
    const [isRecording, setIsRecording] = createSignal(false);
    const [recordingNotSupported, setRecordingNotSupported] = createSignal(false);
    const [isLoadingRecording, setIsLoadingRecording] = createSignal(false);

    // drag & drop
    const [isDragActive, setIsDragActive] = createSignal(false);

    const [isTypingSignal, setIsTypingSignal] = createSignal(getIsTyping());

    const [savedChatId, setSavedChatId] = createSignal('')
    const [webRequestChatId, setWebRequestChatId] = createSignal('')
    const [timezone, setTimezone] = createSignal('')


    const chatHistoryIdentifier = 'chatHistory' + (props.isFullPage ? 'Inline' : '') + (props.chatflowConfig ? (props.chatflowConfig.botId ?? props.chatflowConfig.pineconeNamespace) : '');

    const setMessagesWithStorage = (updateFunction) => {
        setMessages((prevMessages) => {
            const updatedMessages = updateFunction(prevMessages);
            if(!props.chatflowConfig.clearOnRefresh)
            {
                const dataToSave = {
                    chatId: savedChatId() || socketIOClientId() || webRequestChatId(),
                    timestamp: Date.now(),
                    messages: updatedMessages,
                };
                localStorage.setItem(chatHistoryIdentifier, JSON.stringify(dataToSave));
            }
            return updatedMessages;
        });
    };

    const handleTypingChange = (newIsTyping) => {
        console.log('handleTypingChange: ' + newIsTyping);
        setIsTypingSignal(newIsTyping);
    };

    createEffect(() => {
        // This function should run when the component mounts
        const handleTypingChange = (newIsTyping) => {
            setIsTypingSignal(newIsTyping);
        };

        // Register the listener
        addIsTypingListener(handleTypingChange);

        // Cleanup: Unregister the listener when the component unmounts
        onCleanup(() => {
            removeIsTypingListener(handleTypingChange);
        });
    });

    onMount(() => {
        if(!props.chatflowConfig.clearOnRefresh)
        {
            const savedData = JSON.parse(localStorage.getItem(chatHistoryIdentifier));
            if (savedData) {
                const currentTime = Date.now();
                const timeElapsed = currentTime - savedData.timestamp;

                if (props.chatflowConfig.infiniteMemory || timeElapsed <= 432){//00000) { // 12 hours
                    setMessages(savedData.messages)
                    if(savedData.chatId)
                    {
                        setSavedChatId(savedData.chatId);
                        setWebRequestChatId(savedData.chatId);
                    }
                } else {
                    localStorage.removeItem(chatHistoryIdentifier); // Clear outdated history
                }
            }
        }

        if (botProps?.observersConfig) {
            const {observeUserInput, observeLoading, observeMessages} = botProps.observersConfig;
            typeof observeUserInput === 'function' &&
            // eslint-disable-next-line solid/reactivity
            createMemo(() => {
                observeUserInput(userInput());
            });
            typeof observeLoading === 'function' &&
            // eslint-disable-next-line solid/reactivity
            createMemo(() => {
                observeLoading(loading());
            });
            typeof observeMessages === 'function' &&
            // eslint-disable-next-line solid/reactivity
            createMemo(() => {
                observeMessages(messages());
            });
        }

        if (!bottomSpacer) return;
        setTimeout(() => {
            chatContainer?.scrollTo(0, chatContainer.scrollHeight);
        }, 50);
    });

    const scrollToBottom = () => {
        setTimeout(() => {
            chatContainer?.scrollTo(0, chatContainer.scrollHeight);
        }, 50);
    };

    /**
     * Add each chat message into localStorage
     */
    /*const addChatMessage = (allMessage: MessageType[]) => {
        setLocalStorageChatflow(props.chatflowid, chatId(), { chatHistory: allMessage });
    };**/

    const updateLastMessage = (text: string, messageId: string, sourceDocuments: any = null, fileAnnotations: any = null) => {
        setMessagesWithStorage((data) => {
            const updated = data.map((item, i) => {
                if (i === data.length - 1) {
                    return {...item, message: item.message + text, messageId, sourceDocuments, fileAnnotations};
                }
                return item;
            });
            //addChatMessage(updated);
            return [...updated];
        });
    };

    const updateLastMessageSourceDocuments = (sourceDocuments: any) => {
        setMessagesWithStorage((data) => {
            const updated = data.map((item, i) => {
                if (i === data.length - 1) {
                    return {...item, sourceDocuments: sourceDocuments};
                }
                return item;
            });
            //addChatMessage(updated);
            return [...updated];
        });
    };

    const clearPreviews = () => {
        // Revoke the data uris to avoid memory leaks
        previews().forEach((file) => URL.revokeObjectURL(file.preview));
        setPreviews([]);
    };

    // Handle errors
    const handleError = (message = 'Oops! There seems to be an error. Please try again.') => {
        setMessagesWithStorage((prevMessages) => {
            const messages: MessageType[] = [...prevMessages, {
                message: props.errorMessage || message,
                type: 'apiMessage'
            }];
            //addChatMessage(messages);
            return messages;
        });
        setLoading(false);
        setUserInput('');
        scrollToBottom();
    };

    const promptClick = (prompt: string) => {
        handleSubmit(prompt);
    };

    function useWebRequest() {
        return (props.apiHost as string).endsWith('lambda-url.eu-central-1.on.aws')
    }

    // Handle form submission
    const handleSubmit = async (value: string) => {
        setUserInput(value);

        if (value.trim() === '') {
            const containsAudio = previews().filter((item) => item.type === 'audio').length > 0;
            if (!(previews().length >= 1 && containsAudio)) {
                return;
            }
        }

        setLoading(true);
        scrollToBottom();

        const urls = previews().map((item) => {
            return {
                data: item.data,
                type: item.type,
                name: item.name,
                mime: item.mime,
            };
        });

        clearPreviews();

        // Send user question and history to API
        const welcomeMessage = props.welcomeMessage ?? defaultWelcomeMessage;
        const messageList = messages().filter((msg) => msg.message !== welcomeMessage).map(m => {
            return {'message': m.message, 'type': m.type}
        });

        setMessagesWithStorage((prevMessages) => {
            const messages: MessageType[] = [...prevMessages, {message: value, type: 'userMessage', fileUploads: urls}];
            //addChatMessage(messages);
            return messages;
        });

        const body: IncomingInput = {
            question: value,
            history: messageList
        };

        if (urls && urls.length > 0) body.uploads = urls;

        if (props.chatflowConfig) body.overrideConfig = props.chatflowConfig;

        if (leadEmail()) body.leadEmail = leadEmail();

        if (!useWebRequest() && isChatFlowAvailableToStream()) {
            body.socketIOClientId = socketIOClientId()

            if (savedChatId())
                body.chatId = savedChatId();
        }
        else {
            setMessagesWithStorage((prevMessages) => [...prevMessages, {message: '', type: 'apiMessage'}]);
            body.webRequestChatId = savedChatId() || webRequestChatId()
            body.timezone = timezone()
        }

        const result = await sendMessageQuery({
            chatflowid: props.chatflowid,
            apiHost: props.apiHost,
            body,
        });

        if (result.data) {

            if (useWebRequest())
                setIsTyping(false);

            const data = result.data;
            const question = data.question;
            if (value === '' && question) {
                setMessagesWithStorage((data) => {
                    const messages = data.map((item, i) => {
                        if (i === data.length - 2) {
                            return {...item, message: question};
                        }
                        return item;
                    });
                    //addChatMessage(messages);
                    return [...messages];
                });
            }
            if (urls && urls.length > 0) {
                setMessagesWithStorage((data) => {
                    const messages = data.map((item, i) => {
                        if (i === data.length - 2) {
                            if (item.fileUploads) {
                                const fileUploads = item?.fileUploads.map((file) => ({
                                    type: file.type,
                                    name: file.name,
                                    mime: file.mime,
                                }));
                                return {...item, fileUploads};
                            }
                        }
                        return item;
                    });
                    //addChatMessage(messages);
                    return [...messages];
                });
            }
            if (!isChatFlowAvailableToStream()) {
                let text = '';
                if (data.text) text = data.text;
                else if (data.json) text = JSON.stringify(data.json, null, 2);
                else text = data;

                updateLastMessage(text, data?.chatMessageId, data?.sourceDocuments, data?.fileAnnotations);
            } else {
                updateLastMessage('', data?.chatMessageId, data?.sourceDocuments, data?.fileAnnotations);
            }
            setLoading(false);
            setUserInput('');
            scrollToBottom();
        }
        if (result.error) {
            const error = result.error;
            console.error(error);
            if (typeof error === 'object') {
                handleError(`Error: ${error?.message.replaceAll('Error:', ' ')}`);
                return;
            }
            if (typeof error === 'string') {
                handleError(error);
                return;
            }
            handleError();
            return;
        }
    };

    /*const clearChat = () => {
         try {
          removeLocalStorageChatHistory(props.chatflowid);
          setChatId(
            (props.chatflowConfig?.vars as any)?.customerId ? `${(props.chatflowConfig?.vars as any).customerId.toString()}+${uuidv4()}` : uuidv4(),
          );
          const messages: MessageType[] = [
            {
              message: props.welcomeMessage ?? defaultWelcomeMessage,
              type: 'apiMessage',
            },
          ];
          if (leadsConfig()?.status && !getLocalStorageChatflow(props.chatflowid)?.lead) {
            messages.push({ message: '', type: 'leadCaptureMessage' });
          }
          setMessages(messages);
        } catch (error: any) {
          const errorData = error.response.data || `${error.response.status}: ${error.response.statusText}`;
          console.error(`error: ${errorData}`);
        }
    };*/

    const clearChat = () => {
        if(isTypingSignal())
            return;
        localStorage.removeItem(chatHistoryIdentifier); // Use the existing chatHistoryIdentifier variable
        setMessages([
            {
                message: props.welcomeMessage ?? defaultWelcomeMessage, // Use the existing defaultWelcomeMessage variable or props
                type: 'apiMessage'
            }
        ]);
        if (useWebRequest())
            setWebRequestChatId(savedChatId() || generateRandomString(10))
        else{
            setSavedChatId(generateRandomString(10))
        }
    };

    // Auto scroll chat to bottom
    createEffect(() => {
        if (messages()) {
            if (messages().length > 1) {
                setTimeout(() => {
                    chatContainer?.scrollTo(0, chatContainer.scrollHeight);
                }, 400);
            }
        }
    });

    createEffect(() => {
        if (props.fontSize && botContainer) botContainer.style.fontSize = `${props.fontSize}px`;
    });


    // eslint-disable-next-line solid/reactivity
    createEffect(async () => {

        if (props.chatflowConfig?.useCalendly) {
            const cssLink = document.createElement('link');
            cssLink.href = 'https://assets.calendly.com/assets/external/widget.css';
            cssLink.rel = 'stylesheet';
            document.head.appendChild(cssLink);

            const script = document.createElement("script");
            script.src = "https://assets.calendly.com/assets/external/widget.js";
            script.async = true;
            document.head.appendChild(script);
        }

        if (useWebRequest()) {

            if (props.chatflowConfig?.useTimezone)
                setTimezone(getBrowserTimezone());

            setWebRequestChatId(savedChatId() || generateRandomString(10))
            return;
        }

        /*const chatMessage = getLocalStorageChatflow(props.chatflowid);
        if (chatMessage && Object.keys(chatMessage).length) {
          if (chatMessage.chatId) setChatId(chatMessage.chatId);
          const savedLead = chatMessage.lead;
          if (savedLead) {
            setIsLeadSaved(!!savedLead);
            setLeadEmail(savedLead.email);
          }
          const loadedMessages: MessageType[] =
            chatMessage?.chatHistory?.length > 0
              ? chatMessage.chatHistory?.map((message: MessageType) => {
                  const chatHistory: MessageType = {
                    messageId: message?.messageId,
                    message: message.message,
                    type: message.type,
                  };
                  if (message.sourceDocuments) chatHistory.sourceDocuments = message.sourceDocuments;
                  if (message.fileAnnotations) chatHistory.fileAnnotations = message.fileAnnotations;
                  if (message.fileUploads) chatHistory.fileUploads = message.fileUploads;
                  return chatHistory;
                })
              : [{ message: props.welcomeMessage ?? defaultWelcomeMessage, type: 'apiMessage' }];
          const filteredMessages = loadedMessages.filter((message) => message.message !== '' && message.type !== 'leadCaptureMessage');
          setMessages([...filteredMessages]);
        }*/

        // Determine if particular chatflow is available for streaming
        const {data} = await isStreamAvailableQuery({
            chatflowid: props.chatflowid,
            apiHost: props.apiHost,
        });

        if (data) {
            setIsChatFlowAvailableToStream(data?.isStreaming ?? false);
        }

        // Get the chatbotConfig
        const result = await getChatbotConfig({
            chatflowid: props.chatflowid,
            apiHost: props.apiHost,
        });

        if (result.data) {
            const chatbotConfig = result.data;
            if (chatbotConfig.starterPrompts) {
                const prompts: string[] = [];
                Object.getOwnPropertyNames(chatbotConfig.starterPrompts).forEach((key) => {
                    prompts.push(chatbotConfig.starterPrompts[key].prompt);
                });
                setStarterPrompts(prompts.filter((prompt) => prompt !== ''));
            }
            if (chatbotConfig.chatFeedback) {
                const chatFeedbackStatus = chatbotConfig.chatFeedback.status;
                setChatFeedbackStatus(chatFeedbackStatus);
            }
            if (chatbotConfig.uploads) {
                setUploadsConfig(chatbotConfig.uploads);
            }
            if (chatbotConfig.leads) {
                setLeadsConfig(chatbotConfig.leads);
                if (chatbotConfig.leads?.status && !getLocalStorageChatflow(props.chatflowid)?.lead) {
                    setMessages((prevMessages) => [...prevMessages, { message: '', type: 'leadCaptureMessage' }]);
                }
            }
        }

        const socket = socketIOClient(props.apiHost as string);

        let started;

        socket.on('connect', () => {
            setSocketIOClientId(socket.id);
        });

        socket.on('start', () => {
            started = true;
            setIsTyping(true);
            setMessagesWithStorage((prevMessages) => [...prevMessages, {message: '', type: 'apiMessage'}]);
        });

        socket.on('end', () => {
            if (started) {
                started = false;
                setIsTyping(false);
            }
        });

        socket.on('sourceDocuments', updateLastMessageSourceDocuments);

        socket.on('token', updateLastMessage);

        // eslint-disable-next-line solid/reactivity
        return () => {
            setUserInput('');
            setLoading(false);
            setMessagesWithStorage([
                {
                    message: props.welcomeMessage ?? defaultWelcomeMessage,
                    type: 'apiMessage',
                },
            ]);
            if (socket) {
                socket.disconnect();
                setSocketIOClientId('');
            }
        };
    });

    const isValidURL = (url: string): URL | undefined => {
        try {
            return new URL(url);
        } catch (err) {
            return undefined;
        }
    };

    const removeDuplicateURL = (message: MessageType) => {
        const visitedURLs: string[] = [];
        const newSourceDocuments: any = [];

        let sourceDocs = message.sourceDocuments;

        sourceDocs.sort((a, b) => {
            // Check if the 'score' property exists in both objects
            if ('score' in a.metadata && 'score' in b.metadata) {
                // Sort by score in descending order
                return b.metadata.score - a.metadata.score;
            } else if ('score' in a.metadata) {
                // 'a' has a score, so it should come before 'b'
                return -1;
            } else if ('score' in b.metadata) {
                // 'b' has a score, so it should come after 'a'
                return 1;
            } else {
                // Neither 'a' nor 'b' has a score, maintain their original order
                return 0;
            }
        })

        sourceDocs.forEach((source: any) => {
            if (isValidURL(source.metadata['sourceUrl']) && !visitedURLs.includes(source.metadata['sourceUrl'])) {
                visitedURLs.push(source.metadata['sourceUrl'])
                newSourceDocuments.push(source)
            } else if (!isValidURL(source.metadata['sourceUrl'])) {
                newSourceDocuments.push(source)
            }
        })
        return newSourceDocuments;
    };

    const addRecordingToPreviews = (blob: Blob) => {
        let mimeType = '';
        const pos = blob.type.indexOf(';');
        if (pos === -1) {
            mimeType = blob.type;
        } else {
            mimeType = blob.type.substring(0, pos);
        }

        // read blob and add to previews
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
            const base64data = reader.result as FilePreviewData;
            const upload: FilePreview = {
                data: base64data,
                preview: '../assets/wave-sound.jpg',
                type: 'audio',
                name: 'audio.wav',
                mime: mimeType,
            };
            setPreviews((prevPreviews) => [...prevPreviews, upload]);
        };
    };

    const isFileAllowedForUpload = (file: File) => {
        let acceptFile = false;
        if (uploadsConfig() && uploadsConfig()?.isImageUploadAllowed && uploadsConfig()?.imgUploadSizeAndTypes) {
            const fileType = file.type;
            const sizeInMB = file.size / 1024 / 1024;
            uploadsConfig()?.imgUploadSizeAndTypes.map((allowed) => {
                if (allowed.fileTypes.includes(fileType) && sizeInMB <= allowed.maxUploadSize) {
                    acceptFile = true;
                }
            });
        }
        if (!acceptFile) {
            alert(`Cannot upload file. Kindly check the allowed file types and maximum allowed size.`);
        }
        return acceptFile;
    };

    const handleFileChange = async (event: FileEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) {
            return;
        }
        const filesList = [];
        for (const file of files) {
            if (isFileAllowedForUpload(file) === false) {
                return;
            }
            const reader = new FileReader();
            const {name} = file;
            filesList.push(
                new Promise((resolve) => {
                    reader.onload = (evt) => {
                        if (!evt?.target?.result) {
                            return;
                        }
                        const {result} = evt.target;
                        resolve({
                            data: result,
                            preview: URL.createObjectURL(file),
                            type: 'file',
                            name: name,
                            mime: file.type,
                        });
                    };
                    reader.readAsDataURL(file);
                }),
            );
        }

        const newFiles = await Promise.all(filesList);
        setPreviews((prevPreviews) => [...prevPreviews, ...(newFiles as FilePreview[])]);
    };

    const handleDrag = (e: DragEvent) => {
        if (uploadsConfig()?.isImageUploadAllowed) {
            e.preventDefault();
            e.stopPropagation();
            if (e.type === 'dragenter' || e.type === 'dragover') {
                setIsDragActive(true);
            } else if (e.type === 'dragleave') {
                setIsDragActive(false);
            }
        }
    };

    const handleDrop = async (e: InputEvent | DragEvent) => {
        if (!uploadsConfig()?.isImageUploadAllowed) {
            return;
        }
        e.preventDefault();
        setIsDragActive(false);
        const files = [];
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            for (const file of e.dataTransfer.files) {
                if (isFileAllowedForUpload(file) === false) {
                    return;
                }
                const reader = new FileReader();
                const {name} = file;
                files.push(
                    new Promise((resolve) => {
                        reader.onload = (evt) => {
                            if (!evt?.target?.result) {
                                return;
                            }
                            const {result} = evt.target;
                            let previewUrl;
                            if (file.type.startsWith('audio/')) {
                                previewUrl = '../assets/wave-sound.jpg';
                            } else if (file.type.startsWith('image/')) {
                                previewUrl = URL.createObjectURL(file);
                            }
                            resolve({
                                data: result,
                                preview: previewUrl,
                                type: 'file',
                                name: name,
                                mime: file.type,
                            });
                        };
                        reader.readAsDataURL(file);
                    }),
                );
            }

            const newFiles = await Promise.all(files);
            setPreviews((prevPreviews) => [...prevPreviews, ...(newFiles as FilePreview[])]);
        }

        if (e.dataTransfer && e.dataTransfer.items) {
            for (const item of e.dataTransfer.items) {
                if (item.kind === 'string' && item.type.match('^text/uri-list')) {
                    item.getAsString((s: string) => {
                        const upload: FilePreview = {
                            data: s,
                            preview: s,
                            type: 'url',
                            name: s.substring(s.lastIndexOf('/') + 1),
                            mime: '',
                        };
                        setPreviews((prevPreviews) => [...prevPreviews, upload]);
                    });
                } else if (item.kind === 'string' && item.type.match('^text/html')) {
                    item.getAsString((s: string) => {
                        if (s.indexOf('href') === -1) return;
                        //extract href
                        const start = s.substring(s.indexOf('href') + 6);
                        const hrefStr = start.substring(0, start.indexOf('"'));

                        const upload: FilePreview = {
                            data: hrefStr,
                            preview: hrefStr,
                            type: 'url',
                            name: hrefStr.substring(hrefStr.lastIndexOf('/') + 1),
                            mime: '',
                        };
                        setPreviews((prevPreviews) => [...prevPreviews, upload]);
                    });
                }
            }
        }
    };

    const handleDeletePreview = (itemToDelete: FilePreview) => {
        if (itemToDelete.type === 'file') {
            URL.revokeObjectURL(itemToDelete.preview); // Clean up for file
        }
        setPreviews(previews().filter((item) => item !== itemToDelete));
    };

    const onMicrophoneClicked = () => {
        setIsRecording(true);
        startAudioRecording(setIsRecording, setRecordingNotSupported, setElapsedTime);
    };

    const onRecordingCancelled = () => {
        if (!recordingNotSupported) cancelAudioRecording();
        setIsRecording(false);
        setRecordingNotSupported(false);
    };

    const onRecordingStopped = async () => {
        setIsLoadingRecording(true);
        stopAudioRecording(addRecordingToPreviews);
    };

    createEffect(
        // listen for changes in previews
        on(previews, (uploads) => {
            // wait for audio recording to load and then send
            const containsAudio = uploads.filter((item) => item.type === 'audio').length > 0;
            if (uploads.length >= 1 && containsAudio) {
                setIsRecording(false);
                setRecordingNotSupported(false);
                promptClick('');
            }

            return () => {
                setPreviews([]);
            };
        }),
    );

    return (
        <>
            <div
                ref={botContainer}
                class={'relative flex w-full h-full text-base overflow-hidden bg-cover bg-center flex-col items-center chatbot-container ' + props.class}
                onDragEnter={handleDrag}
            >
                <Show when={props.chatflowConfig.showClearButton && messages().length >= 3}>
                    <div className={`clearChatButton ${isTypingSignal() ? 'disabled' : ''}`} onClick={clearChat}
                         style={{pointerEvents: isTypingSignal() ? 'none' : 'auto'}}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="currentColor"
                             viewBox="0 0 16 16" style={{color: isTypingSignal() ? '#eaeaea' : 'white'}}>
                            <path
                                d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                            <path fill-rule="evenodd"
                                  d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                        </svg>
                        <span className="textAdjust">Vyčistit chat</span>
                    </div>
                </Show>
                {isDragActive() && (
                    <div
                        class="absolute top-0 left-0 bottom-0 right-0 w-full h-full z-50"
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragEnd={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    />
                )}
                {isDragActive() && uploadsConfig()?.isImageUploadAllowed && (
                    <div
                        class="absolute top-0 left-0 bottom-0 right-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm text-white z-40 gap-2 border-2 border-dashed"
                        style={{'border-color': props.bubbleBackgroundColor}}
                    >
                        <h2 class="text-xl font-semibold">Drop here to upload</h2>
                        <For each={uploadsConfig()?.imgUploadSizeAndTypes}>
                            {(allowed) => {
                                return (
                                    <>
                                        <span>{allowed.fileTypes?.join(', ')}</span>
                                        <span>Max Allowed Size: {allowed.maxUploadSize} MB</span>
                                    </>
                                );
                            }}
                        </For>
                    </div>
                )}

                {props.showTitle ? (
                    <div
                        class="flex flex-row items-center w-full h-[50px] absolute top-0 left-0 z-10"
                        style={{
                            background: props.bubbleBackgroundColor,
                            color: props.bubbleTextColor,
                            'border-top-left-radius': props.isFullPage ? '0px' : '6px',
                            'border-top-right-radius': props.isFullPage ? '0px' : '6px',
                        }}
                    >
                        <Show when={props.titleAvatarSrc}>
                            <>
                                <div style={{width: '15px'}}/>
                                <Avatar initialAvatarSrc={props.titleAvatarSrc}/>
                            </>
                        </Show>
                        <Show when={props.title}>
                            <span class="px-3 whitespace-pre-wrap font-semibold max-w-full">{props.title}</span>
                        </Show>
                        <div style={{flex: 1}}/>
                        <DeleteButton
                            sendButtonColor={props.bubbleTextColor}
                            type="button"
                            isDisabled={messages().length === 1}
                            class="my-2 ml-2"
                            on:click={clearChat}
                        >
                            <span style={{'font-family': 'Poppins, sans-serif'}}>Clear</span>
                        </DeleteButton>
                    </div>
                ) : null}
                <div class="flex flex-col w-full h-full justify-start z-0">
                    <div
                        ref={chatContainer}
                        class="overflow-y-scroll flex flex-col flex-grow min-w-full w-full px-3 pt-10 relative scrollable-container chatbot-chat-view scroll-smooth"
                    >
                        <For each={[...messages()]}>
                            {(message, index) => {
                                return (
                                    <>
                                        {message.type === 'userMessage' && (
                                            <GuestBubble
                                                message={message}
                                                apiHost={props.apiHost}
                                                chatflowid={props.chatflowid}
                                                chatId={savedChatId() || socketIOClientId() || webRequestChatId()}
                                                backgroundColor={props.userMessage?.backgroundColor}
                                                textColor={props.userMessage?.textColor}
                                                showAvatar={props.userMessage?.showAvatar}
                                                avatarSrc={props.userMessage?.avatarSrc}
                                                fontSize={props.fontSize}
                                            />
                                        )}
                                        {message.type === 'apiMessage' && (
                                            <BotBubble
                                                message={message}
                                                fileAnnotations={message.fileAnnotations}
                                                chatflowid={props.chatflowid}
                                                chatId={savedChatId() || socketIOClientId() || webRequestChatId()}
                                                apiHost={props.apiHost}
                                                backgroundColor={props.botMessage?.backgroundColor}
                                                textColor={props.botMessage?.textColor}
                                                feedbackColor={props.feedback?.color}
                                                showAvatar={props.botMessage?.showAvatar}
                                                avatarSrc={props.botMessage?.avatarSrc}
                                                chatFeedbackStatus={chatFeedbackStatus()}
                                                fontSize={props.fontSize}
                                            />
                                        )}
                                        {message.type === 'leadCaptureMessage' && leadsConfig()?.status && !getLocalStorageChatflow(props.chatflowid)?.lead && (
                                            <LeadCaptureBubble
                                                message={message}
                                                chatflowid={props.chatflowid}
                                                chatId={chatId()}
                                                apiHost={props.apiHost}
                                                backgroundColor={props.botMessage?.backgroundColor}
                                                textColor={props.botMessage?.textColor}
                                                fontSize={props.fontSize}
                                                showAvatar={props.botMessage?.showAvatar}
                                                avatarSrc={props.botMessage?.avatarSrc}
                                                leadsConfig={leadsConfig()}
                                                sendButtonColor={props.textInput?.sendButtonColor}
                                                isLeadSaved={isLeadSaved()}
                                                setIsLeadSaved={setIsLeadSaved}
                                                setLeadEmail={setLeadEmail}
                                            />
                                        )}
                                        {message.type === 'userMessage' && loading() && index() === messages().length - 1 &&
                                        <LoadingBubble/>}
                                        {message.type === 'apiMessage' && message.message === '' && loading() && index() === messages().length - 1 &&
                                        <LoadingBubble/>}
                                        {message.sourceDocuments && message.sourceDocuments.length && (
                                            <div style={{
                                                display: 'flex',
                                                'flex-direction': 'column',
                                                width: '100%',
                                                'flex-wrap': 'wrap'
                                            }}>
                                                <For each={[...removeDuplicateURL(message)]}>
                                                    {(src) => {
                                                        const URL = isValidURL(src.metadata.source);
                                                        if (!src.metadata['sourceUrl'] || !src.metadata['score'] || src.metadata['score'] < 0.822)
                                                            return;
                                                        return (
                                                            <SourceBubble
                                                                pageContent={URL ? URL.pathname : src.pageContent}
                                                                metadata={src.metadata}
                                                                onSourceClick={() => {
                                                                    if (URL) {
                                                                        window.open(src.metadata.source, '_blank');
                                                                    } else {
                                                                        setSourcePopupSrc(src);
                                                                        setSourcePopupOpen(true);
                                                                    }
                                                                }}
                                                            />
                                                        );
                                                    }}
                                                </For>
                                            </div>
                                        )}
                                    </>
                                );
                            }}
                        </For>
                    </div>
                    <Show when={messages().length === 1}>
                        <Show when={starterPrompts().length > 0}>
                            <div class="w-full flex flex-row flex-wrap px-5 py-[10px] gap-2">
                                <For each={[...starterPrompts()]}>{(key) => <StarterPromptBubble prompt={key}
                                                                                                 onPromptClick={() => promptClick(key)}/>}</For>
                            </div>
                        </Show>
                    </Show>
                    <Show when={previews().length > 0}>
                        <div
                            class="w-full flex items-center justify-start gap-2 px-5 pt-2 border-t border-[#eeeeee]">
                            <For each={[...previews()]}>
                                {(item) => (
                                    <>
                                        {item.mime.startsWith('image/') ? (
                                            <button
                                                class="group w-12 h-12 flex items-center justify-center relative rounded-[10px] overflow-hidden transition-colors duration-200"
                                                onClick={() => handleDeletePreview(item)}
                                            >
                                                <img class="w-full h-full bg-cover" src={item.data as string}/>
                                                <span
                                                    class="absolute hidden group-hover:flex items-center justify-center z-10 w-full h-full top-0 left-0 bg-black/10 rounded-[10px] transition-colors duration-200">
                          <TrashIcon/>
                        </span>
                                            </button>
                                        ) : (
                                            <div
                                                class={`inline-flex basis-auto flex-grow-0 flex-shrink-0 justify-between items-center rounded-xl h-12 p-1 mr-1 bg-gray-500`}
                                                style={{
                                                    width: `${
                                                        chatContainer ? (botProps.isFullPage ? chatContainer?.offsetWidth / 4 : chatContainer?.offsetWidth / 2) : '200'
                                                        }px`,
                                                }}
                                            >
                                                <audio
                                                    class="block bg-cover bg-center w-full h-full rounded-none text-transparent"
                                                    controls src={item.data as string}/>
                                                <button
                                                    class="w-7 h-7 flex items-center justify-center bg-transparent p-1"
                                                    onClick={() => handleDeletePreview(item)}>
                                                    <TrashIcon color="white"/>
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </For>
                        </div>
                    </Show>
                    <div class="w-full px-5 pt-2 pb-1">
                        {isRecording() ? (
                            <>
                                {recordingNotSupported() ? (
                                    <div
                                        class="w-full flex items-center justify-between p-4 border border-[#eeeeee]">
                                        <div class="w-full flex items-center justify-between gap-3">
                                            <span class="text-base">To record audio, use modern browsers like Chrome or Firefox that support audio recording.</span>
                                            <button
                                                class="py-2 px-4 justify-center flex items-center bg-red-500 text-white rounded-md"
                                                type="button"
                                                onClick={() => onRecordingCancelled()}
                                            >
                                                Okay
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        class="h-[58px] flex items-center justify-between chatbot-input border border-[#eeeeee]"
                                        data-testid="input"
                                        style={{
                                            margin: 'auto',
                                            'background-color': props.textInput?.backgroundColor ?? defaultBackgroundColor,
                                            color: props.textInput?.textColor ?? defaultTextColor,
                                        }}
                                    >
                                        <div class="flex items-center gap-3 px-4 py-2">
                      <span>
                        <CircleDotIcon color="red"/>
                      </span>
                                            <span>{elapsedTime() || '00:00'}</span>
                                            {isLoadingRecording() && <span class="ml-1.5">Sending...</span>}
                                        </div>
                                        <div class="flex items-center">
                                            <CancelButton buttonColor={props.textInput?.sendButtonColor}
                                                          type="button" class="m-0" on:click={onRecordingCancelled}>
                                                <span style={{'font-family': 'Poppins, sans-serif'}}>Send</span>
                                            </CancelButton>
                                            <SendButton
                                                sendButtonColor={props.textInput?.sendButtonColor}
                                                type="button"
                                                isDisabled={loading()}
                                                class="m-0"
                                                on:click={onRecordingStopped}
                                            >
                                                <span style={{'font-family': 'Poppins, sans-serif'}}>Send</span>
                                            </SendButton>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <TextInput
                                backgroundColor={props.textInput?.backgroundColor}
                                textColor={props.textInput?.textColor}
                                placeholder={props.textInput?.placeholder}
                                sendButtonColor={props.textInput?.sendButtonColor}
                                fontSize={props.fontSize}
                                disabled={loading() || (leadsConfig()?.status && !isLeadSaved())}
                                defaultValue={userInput()}
                                onSubmit={handleSubmit}
                                uploadsConfig={uploadsConfig()}
                                setPreviews={setPreviews}
                                onMicrophoneClicked={onMicrophoneClicked}
                                handleFileChange={handleFileChange}
                            />
                        )}
                    </div>
                    <Badge badgeBackgroundColor={props.badgeBackgroundColor}
                           poweredByTextColor={props.poweredByTextColor} policyUrl={props.chatflowConfig?.policyUrl}
                           botContainer={botContainer}/>
                </div>
            </div>
            {sourcePopupOpen() &&
            <Popup isOpen={sourcePopupOpen()} value={sourcePopupSrc()} onClose={() => setSourcePopupOpen(false)}/>}
        </>
    );

    function generateRandomString(length) {
        var result = '';
        var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var charactersLength = characters.length;
        for (var i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
    }

    function getBrowserTimezone() {
        // Get the current timezone offset in minutes and invert the sign
        const offset = -new Date().getTimezoneOffset();

        // Convert the offset to hours and minutes
        const absOffset = Math.abs(offset);
        const hours = Math.floor(absOffset / 60);
        const minutes = absOffset % 60;

        // Format the timezone in the GMT±H or GMT±H:MM format
        const sign = offset >= 0 ? "+" : "-";
        const formattedHours = hours.toString().padStart(2, '0');
        const formattedMinutes = minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : '';

        return `GMT${sign}${formattedHours}${formattedMinutes}`;
    }
};

// type BottomSpacerProps = {
//   ref: HTMLDivElement | undefined;
// };
// const BottomSpacer = (props: BottomSpacerProps) => {
//   return <div ref={props.ref} class="w-full h-32" />;
// };
