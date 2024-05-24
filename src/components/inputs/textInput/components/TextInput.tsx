import { ShortTextInput } from './ShortTextInput';
import { isMobile } from '@/utils/isMobileSignal';
import { createSignal, onMount, onCleanup, createEffect, Setter } from 'solid-js'
import { getIsTyping, addIsTypingListener, removeIsTypingListener } from '@/components/Bot';
import { SendButton } from '@/components/buttons/SendButton';
import { FileEvent, UploadsConfig } from '@/components/Bot';
import { ImageUploadButton } from '@/components/buttons/ImageUploadButton';
import { RecordAudioButton } from '@/components/buttons/RecordAudioButton';
import { MultiLineTextInput } from './MultiLineTextInput'


type Props = {
  placeholder?: string;
  backgroundColor?: string;
  textColor?: string;
  sendButtonColor?: string;
  defaultValue?: string;
  fontSize?: number;
  disabled?: boolean;
  onSubmit: (value: string) => void;
  uploadsConfig?: Partial<UploadsConfig>;
  setPreviews: Setter<unknown[]>;
  onMicrophoneClicked: () => void;
  handleFileChange: (event: FileEvent<HTMLInputElement>) => void;
};

const defaultBackgroundColor = '#ffffff';
const defaultTextColor = '#303235';

export const TextInput = (props: Props) => {
  const [inputValue, setInputValue] = createSignal(props.defaultValue ?? '');
  let inputRef: HTMLInputElement | HTMLTextAreaElement | undefined;
  let fileUploadRef: HTMLInputElement | HTMLTextAreaElement | undefined;

    const [isTyping, setIsTyping] = createSignal(getIsTyping());
    const handleTypingChange = (newIsTyping) => {
        console.log('handleTypingChange: ' + newIsTyping);
        setIsTyping(newIsTyping);
    };

    createEffect(() => {
        // This function should run when the component mounts
        const handleTypingChange = (newIsTyping) => {
            setIsTyping(newIsTyping);
        };

        // Register the listener
        addIsTypingListener(handleTypingChange);

        // Cleanup: Unregister the listener when the component unmounts
        onCleanup(() => {
            removeIsTypingListener(handleTypingChange);
        });
    });

  const handleInput = (inputValue: string) => setInputValue(inputValue);

  const checkIfInputIsValid = () => inputValue() !== '' && inputRef?.reportValidity();

  const submit = () => {

      if (getIsTyping())
          return;

    if (checkIfInputIsValid()) props.onSubmit(inputValue());
    setInputValue('');
  };

  const submitWhenEnter = (e: KeyboardEvent) => {

      if (getIsTyping())
          return;
    // Check if IME composition is in progress
    const isIMEComposition = e.isComposing || e.keyCode === 229;
      if (e.key === 'Enter' && !isIMEComposition) {
          if (e.shiftKey) {

          } else {
              // Submit on Enter (without Shift)
              e.preventDefault();
              submit();
          }
      }
  };

  const handleImageUploadClick = () => {
    if (fileUploadRef) fileUploadRef.click();
  };

  createEffect(() => {
    if (!props.disabled && !isMobile() && inputRef) inputRef.focus();
  });

  onMount(() => {
    if (!isMobile() && inputRef) inputRef.focus();
  });

  const handleFileChange = (event: FileEvent<HTMLInputElement>) => {
    props.handleFileChange(event);
    // 👇️ reset file input
    if (event.target) event.target.value = '';
  };

  return (
    <div
      class={'w-full h-auto max-h-[128px] min-h-[56px] flex items-center justify-between chatbot-input border border-[#eeeeee]'}
      data-testid="input"
      style={{
        margin: 'auto',
        'background-color': props.backgroundColor ?? defaultBackgroundColor,
        color: props.textColor ?? defaultTextColor,
      }}
      onKeyDown={submitWhenEnter}
    >
      {props.uploadsConfig?.isImageUploadAllowed ? (
        <>
          <ImageUploadButton
            buttonColor={props.sendButtonColor}
            type="button"
            class="m-0 h-14 flex items-center justify-center"
            on:click={handleImageUploadClick}
          >
            <span style={{ 'font-family': 'Poppins, sans-serif' }}>Image Upload</span>
          </ImageUploadButton>
          <input style={{ display: 'none' }} multiple ref={fileUploadRef as HTMLInputElement} type="file" onChange={handleFileChange} />
        </>
      ) : null}
        <MultiLineTextInput
            ref={inputRef as HTMLTextAreaElement}
        onInput={handleInput}
        value={inputValue()}
        fontSize={props.fontSize}
        disabled={props.disabled}
        placeholder={props.placeholder ?? 'Type your question'}
      />
      {props.uploadsConfig?.isSpeechToTextEnabled ? (
        <RecordAudioButton
          buttonColor={props.sendButtonColor}
          type="button"
          class="m-0 start-recording-button h-14 flex items-center justify-center"
          on:click={props.onMicrophoneClicked}
        >
          <span style={{ 'font-family': 'Poppins, sans-serif' }}>Record Audio</span>
        </RecordAudioButton>
      ) : null}
      <SendButton
        sendButtonColor={props.sendButtonColor}
        type="button"
        isDisabled={props.disabled || inputValue() === '' || isTyping()}
        class="m-0 h-14 flex items-center justify-center"
        on:click={submit}
      >
        <span style={{ 'font-family': 'Poppins, sans-serif' }}>Send</span>
      </SendButton>
    </div>
  );
};
