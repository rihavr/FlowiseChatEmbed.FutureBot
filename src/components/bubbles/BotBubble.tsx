import { Show, createSignal, onMount } from 'solid-js';
import { Avatar } from '../avatars/Avatar';
import { Marked } from '@ts-stack/markdown';
import { FeedbackRatingType, sendFeedbackQuery, sendFileDownloadQuery, updateFeedbackQuery } from '@/queries/sendMessageQuery';
import { MessageType } from '../Bot';
import { CopyToClipboardButton, ThumbsDownButton, ThumbsUpButton } from '../buttons/FeedbackButtons';
import FeedbackContentDialog from '../FeedbackContentDialog';

type Props = {
  message: MessageType;
  chatflowid: string;
  chatId: string;
  apiHost?: string;
  fileAnnotations?: any;
  showAvatar?: boolean;
  avatarSrc?: string;
  backgroundColor?: string;
  textColor?: string;
  chatFeedbackStatus?: boolean;
  fontSize?: number;
  feedbackColor?: string;
};

const defaultBackgroundColor = '#f7f8ff';
const defaultTextColor = '#303235';
const defaultFontSize = 16;

Marked.setOptions({ isNoP: true, sanitize: true});

function processMessage(originalMessage) {
    //note: same in GuestBubble

    // Split the original message into lines
    const lines = originalMessage.split("\n");
    let processedLines = [];
    let previousLineWasListItem = false;
    let firstNumberedItem = true;
    let validList = false;

    lines.forEach((line, index) => {
        // Check if the line is likely part of a numbered list
        if (/^\d+\.\s+/.test(line)) {
            let currentNumber = parseInt(line.match(/^\d+/)[0], 10);

            if (firstNumberedItem) {
                validList = (currentNumber === 1);
                firstNumberedItem = false;
            }

            if (!validList) {
                line = line.replace(/^(\d+)\./, '$1.​');
                previousLineWasListItem = false;
            } else {
                let expectedNextNumber = currentNumber + 1;
                let nextLine = lines[index + 1];
                let nextLineStartsWithExpectedNumber = nextLine && nextLine.startsWith(`${expectedNextNumber}.`);

                // Check if the current line continues a list or starts a new one expectedly
                if (previousLineWasListItem && nextLineStartsWithExpectedNumber) {
                    previousLineWasListItem = true; // It's part of a list
                } else {
                    // It's not part of a list, prevent Markdown interpretation
                    line = line.replace(/^(\d+)\./, '$1.​');
                    previousLineWasListItem = false;
                }
            }
        } else {
            previousLineWasListItem = false; // Reset for lines that are clearly not list items
        }

        processedLines.push(line);
    });

    return processedLines.join("<br>");
}


export const BotBubble = (props: Props) => {
  let botMessageEl: HTMLDivElement | undefined;
  const [rating, setRating] = createSignal('');
  const [feedbackId, setFeedbackId] = createSignal('');
  const [showFeedbackContentDialog, setShowFeedbackContentModal] = createSignal(false);

  const downloadFile = async (fileAnnotation: any) => {
    try {
      const response = await sendFileDownloadQuery({
        apiHost: props.apiHost,
        body: { question: '', fileName: fileAnnotation.fileName },
      });
      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileAnnotation.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const copyMessageToClipboard = async () => {
    try {
      const text = botMessageEl ? botMessageEl?.textContent : '';
      await navigator.clipboard.writeText(text || '');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const onThumbsUpClick = async () => {
    if (rating() === '') {
      const body = {
        chatflowid: props.chatflowid,
        chatId: props.chatId,
        messageId: props.message?.messageId as string,
        rating: 'THUMBS_UP' as FeedbackRatingType,
        content: '',
      };
      const result = await sendFeedbackQuery({
        chatflowid: props.chatflowid,
        apiHost: props.apiHost,
        body,
      });

      if (result.data) {
        const data = result.data as any;
        let id = '';
        if (data && data.id) id = data.id;
        setRating('THUMBS_UP');
        setFeedbackId(id);
        setShowFeedbackContentModal(true);
      }
    }
  };

  const onThumbsDownClick = async () => {
    if (rating() === '') {
      const body = {
        chatflowid: props.chatflowid,
        chatId: props.chatId,
        messageId: props.message?.messageId as string,
        rating: 'THUMBS_DOWN' as FeedbackRatingType,
        content: '',
      };
      const result = await sendFeedbackQuery({
        chatflowid: props.chatflowid,
        apiHost: props.apiHost,
        body,
      });

      if (result.data) {
        const data = result.data as any;
        let id = '';
        if (data && data.id) id = data.id;
        setRating('THUMBS_DOWN');
        setFeedbackId(id);
        setShowFeedbackContentModal(true);
      }
    }
  };

  const submitFeedbackContent = async (text: string) => {
    const body = {
      content: text,
    };
    const result = await updateFeedbackQuery({
      id: feedbackId(),
      apiHost: props.apiHost,
      body,
    });

    if (result.data) {
      setFeedbackId('');
      setShowFeedbackContentModal(false);
    }
  };

  onMount(() => {
    if (botMessageEl) {
	let message = processMessage(props.message.message)//.replaceAll("\n", "<br>")
      botMessageEl.innerHTML = Marked.parse(message)
      botMessageEl.querySelectorAll('a').forEach((link) => {
        link.target = '_blank';
      });
      if (props.fileAnnotations && props.fileAnnotations.length) {
        for (const annotations of props.fileAnnotations) {
          const button = document.createElement('button');
          button.textContent = annotations.fileName;
          button.className =
            'py-2 px-4 mb-2 justify-center font-semibold text-white focus:outline-none flex items-center disabled:opacity-50 disabled:cursor-not-allowed disabled:brightness-100 transition-all filter hover:brightness-90 active:brightness-75 file-annotation-button';
          button.addEventListener('click', function () {
            downloadFile(annotations);
          });
          const svgContainer = document.createElement('div');
          svgContainer.className = 'ml-2';
          svgContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-download" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="#ffffff" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></svg>`;

          button.appendChild(svgContainer);
          botMessageEl.appendChild(button);
        }
      }
    }
  });

  return (
    <div>
      <div class="flex flex-row justify-start mb-2 items-start host-container" style={{ 'margin-right': '50px' }}>
        <Show when={props.showAvatar}>
          <Avatar initialAvatarSrc={props.avatarSrc} />
        </Show>
        {props.message.message && (
          <span
            ref={botMessageEl}
            class="px-4 py-2 ml-2 max-w-full chatbot-host-bubble prose"
            data-testid="host-bubble"
            style={{
              'background-color': props.backgroundColor ?? defaultBackgroundColor,
              color: props.textColor ?? defaultTextColor,
              'border-radius': '6px',
              'font-size': props.fontSize ? `${props.fontSize}px` : `${defaultFontSize}`,
            }}
          />
        )}
      </div>
      <div>
        {props.chatFeedbackStatus && props.message.messageId && (
          <>
            <div class={`flex items-center px-2 pb-2 ${props.showAvatar ? 'ml-10' : ''}`}>
              <CopyToClipboardButton feedbackColor={props.feedbackColor} onClick={() => copyMessageToClipboard()} />
              {rating() === '' || rating() === 'THUMBS_UP' ? (
                <ThumbsUpButton
                  feedbackColor={props.feedbackColor}
                  isDisabled={rating() === 'THUMBS_UP'}
                  rating={rating()}
                  onClick={onThumbsUpClick}
                />
              ) : null}
              {rating() === '' || rating() === 'THUMBS_DOWN' ? (
                <ThumbsDownButton
                  feedbackColor={props.feedbackColor}
                  isDisabled={rating() === 'THUMBS_DOWN'}
                  rating={rating()}
                  onClick={onThumbsDownClick}
                />
              ) : null}
            </div>
            <Show when={showFeedbackContentDialog()}>
              <FeedbackContentDialog
                isOpen={showFeedbackContentDialog()}
                onClose={() => setShowFeedbackContentModal(false)}
                onSubmit={submitFeedbackContent}
                backgroundColor={props.backgroundColor}
                textColor={props.textColor}
              />
            </Show>
          </>
        )}
      </div>
    </div>
  );
};
