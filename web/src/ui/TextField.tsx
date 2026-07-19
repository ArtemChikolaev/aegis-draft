import type { InputHTMLAttributes } from "react";
import styles from "./TextField.module.css";

export type TextFieldTone = "default" | "success" | "error";
export type TextFieldVariant = "default" | "invert";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  tone?: TextFieldTone;
  variant?: TextFieldVariant;
};

/** Единое текстовое поле UIkit: поиск, код забега и будущие компактные формы. */
export function TextField({ tone = "default", variant = "default", className, ...rest }: Props) {
  return (
    <input
      className={[styles.field, styles[variant], styles[tone], className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}
