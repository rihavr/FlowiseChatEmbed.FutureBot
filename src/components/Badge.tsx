import { onCleanup, onMount } from 'solid-js';

type Props = {
  botContainer: HTMLDivElement | undefined
  poweredByTextColor?: string
  badgeBackgroundColor?: string
    policyUrl?: string
    showCreditsCost?: bool
}

const defaultTextColor = '#303235';

export const Badge = (props: Props) => {
  let liteBadge: HTMLAnchorElement | undefined
    let policyLabel: HTMLAnchorElement | undefined
  let observer: MutationObserver | undefined

  const appendBadgeIfNecessary = (mutations: MutationRecord[]) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((removedNode) => {
        if ('id' in removedNode && liteBadge && removedNode.id == 'lite-badge') {
          console.log("Sorry, you can't remove the brand 😅");
          props.botContainer?.append(liteBadge);
        }
      });
    });
  };

  onMount(() => {
    if (!document || !props.botContainer) return;
    observer = new MutationObserver(appendBadgeIfNecessary);
    observer.observe(props.botContainer, {
      subtree: false,
      childList: true,
    });
  });

  onCleanup(() => {
    if (observer) observer.disconnect();
  });

  return (
    <span
      class="w-full text-center px-[10px] pt-[6px] pb-[10px] m-auto text-[13px]"
      style={{
        color: props.poweredByTextColor ?? defaultTextColor,
        'background-color': props.badgeBackgroundColor ?? '#ffffff',
      }}
    >{props.showCreditsCost ? (
        <span>Cena za zprávu: 5 kreditů</span>
    ) : (
        <>
      Powered by&nbsp;
      <a
        ref={liteBadge}
        href={'https://futurebot.ai'}
        target="_blank"
        rel="noopener noreferrer"
        class="lite-badge"
        id="lite-badge"
        style={{ 'font-weight': 'bold', color: props.poweredByTextColor ?? defaultTextColor }}
      >
        <span>Futurebot.ai</span>
      </a>
          </>)}{!!props.policyUrl && (
          <>  |&nbsp;&nbsp;
              <a
                  ref={policyLabel}
                  href={props.policyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lite-badge"
                  id="policy-label"
                  style={{"font-weight": 'bold', color: props.poweredByTextColor ?? defaultTextColor}}
              >
                  <span>Zpracování osobních údajů</span>
              </a>
          </>
        )}
    </span>
  );
};
