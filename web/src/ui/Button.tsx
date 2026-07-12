import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "primaryInvert" | "secondary" | "secondaryInvert" | "danger" | "leave" | "back";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

/** Единая кнопка UIkit. Вид определяется variant, тема — токенами (см. design/tokens.css). */
export function Button({ variant = "primary", className, type = "button", children, ...rest }: Props) {
  const variantClass = variant === "primaryInvert" ? `${styles.primary} ${styles.primaryInvert}` : styles[variant];
  return (
    <button type={type} className={[styles.button, variantClass, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </button>
  );
}
