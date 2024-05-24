import { splitProps, onMount } from 'solid-js'
import { JSX } from 'solid-js/jsx-runtime'

type MultiLineTextInputProps = {
    ref: (el: HTMLTextAreaElement) => void
    onInput: (value: string) => void
    fontSize?: number
} & Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onInput'>

export const MultiLineTextInput = (props: MultiLineTextInputProps) => {
    const [local, others] = splitProps(props, ['ref', 'onInput'])

    let textAreaRef: HTMLTextAreaElement | null = null;

    const adjustHeight = () => {
        if (textAreaRef) {
            textAreaRef.style.height = '0'; // Temporarily collapse to get scroll height
            const singleLineHeight = 24; // Adjust to match your single line height
            const maxHeight = singleLineHeight * 5; // Assuming 20px per line, adjust as needed
            textAreaRef.style.height = Math.min(textAreaRef.scrollHeight, maxHeight) + 'px';
        }
    };

    onMount(() => {
        adjustHeight();
    });

    return (
        <textarea
            ref={(el) => {
                textAreaRef = el;
                props.ref?.(el);
            }}
            class='focus:outline-none bg-transparent px-4 py-2 flex-1 w-full text-input' // Adjust padding here
            style={{
                'font-size': props.fontSize ? `${props.fontSize}px` : '16px',
                resize: 'none',
                overflow: 'auto',
                height: '40px' // Set initial height to match single line height
            }}
            onInput={(e) => {
                local.onInput(e.currentTarget.value);
                adjustHeight();
            }}
            {...others}
        />
    )
}
