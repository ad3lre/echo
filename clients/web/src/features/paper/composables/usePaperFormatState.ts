import { computed, type Ref } from 'vue';
import type { Editor } from '@tiptap/core';

export function usePaperFormatState(editor: Ref<Editor | null | undefined>) {
  const activeHeadingLevel = computed((): 0 | 1 | 2 | 3 => {
    const ed = editor.value;
    if (!ed) return 0;
    if (ed.isActive('heading', { level: 1 })) return 1;
    if (ed.isActive('heading', { level: 2 })) return 2;
    if (ed.isActive('heading', { level: 3 })) return 3;
    return 0;
  });

  const textStyleAttrs = computed(() => {
    return (editor.value?.getAttributes('textStyle') ?? {}) as Record<
      string,
      unknown
    >;
  });

  const fontFamily = computed(() => {
    const f = textStyleAttrs.value.fontFamily;
    return typeof f === 'string' ? f : '';
  });

  const fontSizePx = computed(() => {
    const raw = textStyleAttrs.value.fontSize;
    if (typeof raw !== 'string' || !raw) return '';
    return raw.replace(/px$/i, '');
  });

  const textColor = computed(() => {
    const c = editor.value?.getAttributes('textStyle').color;
    return typeof c === 'string' ? c : '';
  });

  const highlightColor = computed(() => {
    const c = editor.value?.getAttributes('highlight').color;
    return typeof c === 'string' ? c : '';
  });

  const textAlign = computed((): 'left' | 'center' | 'right' | 'justify' => {
    const ed = editor.value;
    if (!ed) return 'left';
    if (ed.isActive({ textAlign: 'center' })) return 'center';
    if (ed.isActive({ textAlign: 'right' })) return 'right';
    if (ed.isActive({ textAlign: 'justify' })) return 'justify';
    return 'left';
  });

  return {
    activeHeadingLevel,
    fontFamily,
    fontSizePx,
    textColor,
    highlightColor,
    textAlign,
  };
}
