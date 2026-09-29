#!/bin/sh
set -eu

check_font() {
  requested="$1"
  expected="$2"
  actual="$(fc-match -f '%{family}\n' "$requested" | head -1)"
  if [ "$actual" != "$expected" ]; then
    echo "unresolved template font: $requested -> $actual (expected $expected)" >&2
    exit 1
  fi
  printf '%s -> %s\n' "$requested" "$actual"
}

check_font "Arial" "Liberation Sans"
check_font "Songti SC Regular" "Noto Serif CJK SC"
check_font "宋体" "Noto Serif CJK SC"
