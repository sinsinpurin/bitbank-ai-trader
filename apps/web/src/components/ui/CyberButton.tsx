"use client";

import { chakra, type HTMLChakraProps } from "@chakra-ui/react";
import { notch } from "@/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface CyberButtonProps extends HTMLChakraProps<"button"> {
  variant?: Variant;
  size?: "sm" | "md";
}

const VARIANT_STYLE: Record<Variant, HTMLChakraProps<"button">> = {
  // Primary: signal/red 塗り + notch/sm。文字は #F2F2F5(デザインシステム 6.1)
  primary: {
    bg: "signal.red",
    color: "text.primary",
    _hover: { boxShadow: "glowRedLg" },
    _disabled: { bg: "signal.redDim", color: "text.disabled", boxShadow: "none" },
  },
  secondary: {
    bg: "transparent",
    color: "signal.cyan",
    borderWidth: "1px",
    borderColor: "signal.cyan",
    _hover: { boxShadow: "glowCyanSm" },
    _disabled: { color: "text.disabled", borderColor: "text.disabled", boxShadow: "none" },
  },
  ghost: {
    bg: "transparent",
    color: "text.secondary",
    borderWidth: "1px",
    borderColor: "border.grid",
    _hover: { color: "text.primary" },
    _disabled: { color: "text.disabled" },
  },
  danger: {
    bg: "transparent",
    color: "signal.red",
    borderWidth: "1px",
    borderColor: "signal.red",
    _hover: { boxShadow: "glowRedSm" },
    _disabled: { color: "text.disabled", borderColor: "text.disabled", boxShadow: "none" },
  },
};

export function CyberButton({ variant = "secondary", size = "md", ...rest }: CyberButtonProps) {
  return (
    <chakra.button
      fontFamily="heading"
      fontWeight="600"
      fontSize={size === "sm" ? "11px" : "13px"}
      letterSpacing="0.08em"
      textTransform="uppercase"
      px={size === "sm" ? 4 : 7}
      py={size === "sm" ? 2 : 3.5}
      cursor="pointer"
      transition="box-shadow 120ms ease, transform 120ms ease"
      css={{ clipPath: notch.sm }}
      _active={{ transform: "scale(.98)" }}
      _disabled={{ cursor: "not-allowed" }}
      {...VARIANT_STYLE[variant]}
      {...rest}
    />
  );
}
