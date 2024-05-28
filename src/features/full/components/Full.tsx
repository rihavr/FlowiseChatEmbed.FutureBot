import styles from '../../../assets/index.css';
import { Bot, BotProps } from '@/components/Bot';
import { BubbleParams } from '@/features/bubble/types';
import { createSignal, onCleanup, onMount, Show } from 'solid-js';

const defaultButtonColor = '#3B81F6';
const defaultIconColor = 'white';

export type FullProps = BotProps & BubbleParams;

export { markInitializationComplete };

let isInitialized = false;
let resolveInitialization;
const initializationPromise = new Promise((resolve) => {
    resolveInitialization = resolve;
});

// This function should be called from initFull in window.ts when initialization is complete
function markInitializationComplete() {
    isInitialized = true;
    resolveInitialization();
    console.log('Bot initialization marked complete');
}

export const Full = (props: FullProps, { element }: { element: HTMLElement }) => {
  const [isBotDisplayed, setIsBotDisplayed] = createSignal(false);


    async function launchBot() {
        if (!isInitialized) {
            await initializationPromise;  // Wait for the initialization to complete
        }
        console.log('Launching bot');
        setIsBotDisplayed(true);
    }

  const botLauncherObserver = new IntersectionObserver((intersections) => {
    if (intersections.some((intersection) => intersection.isIntersecting)) launchBot();
  });

  onMount(() => {
    botLauncherObserver.observe(element);
  });

  onCleanup(() => {
    botLauncherObserver.disconnect();
  });

  return (
    <>
      <style>{styles}</style>
      <Show when={isBotDisplayed()}>
        <div
          style={{
            'background-color': props.theme?.chatWindow?.backgroundColor || '#ffffff',
            'height': props.theme?.chatWindow?.height ? `${props.theme?.chatWindow?.height.toString()}px` : '75vh',
              'max-height': '75vh',
            'width': props.theme?.chatWindow?.width ? `${props.theme?.chatWindow?.width.toString()}px` : '100%',
            'margin': '0px'
          }}
          /*class={
              `max-h-[75%]`
          }*/
        >
          <Bot
            badgeBackgroundColor={props.theme?.chatWindow?.backgroundColor}
            bubbleBackgroundColor={props.theme?.button?.backgroundColor ?? defaultButtonColor}
            bubbleTextColor={props.theme?.button?.iconColor ?? defaultIconColor}
            showTitle={props.theme?.chatWindow?.showTitle}
            title={props.theme?.chatWindow?.title}
            titleAvatarSrc={props.theme?.chatWindow?.titleAvatarSrc}
            welcomeMessage={props.theme?.chatWindow?.welcomeMessage}
            errorMessage={props.theme?.chatWindow?.errorMessage}
            poweredByTextColor={props.theme?.chatWindow?.poweredByTextColor}
            textInput={props.theme?.chatWindow?.textInput}
            botMessage={props.theme?.chatWindow?.botMessage}
            userMessage={props.theme?.chatWindow?.userMessage}
            feedback={props.theme?.chatWindow?.feedback}
            fontSize={props.theme?.chatWindow?.fontSize}
            chatflowid={props.chatflowid}
            chatflowConfig={props.chatflowConfig}
            apiHost={props.apiHost}
            isFullPage={true}
            observersConfig={props.observersConfig}
          />
        </div>
      </Show>
    </>
  );
};
