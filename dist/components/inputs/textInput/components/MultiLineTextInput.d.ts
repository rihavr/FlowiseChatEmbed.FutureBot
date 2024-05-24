import { JSX } from 'solid-js/jsx-runtime';
type MultiLineTextInputProps = {
    ref: (el: HTMLTextAreaElement) => void;
    onInput: (value: string) => void;
    fontSize?: number;
} & Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onInput'>;
export declare const MultiLineTextInput: (props: MultiLineTextInputProps) => JSX.Element;
export {};
//# sourceMappingURL=MultiLineTextInput.d.ts.map