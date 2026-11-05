import { hasErrors, normalizeArabic, validate } from '../domain';
import type { TranslationService } from './translator';

/** A tiny phrasebook, enough to demonstrate the flow. It is NOT a real translator. */
const PHRASES: Record<string, string> = {
  'بروفايل غزه': 'Gaza Profile',
  'ادعم صوت': 'Support Sawt',
  'تعاون معنا': 'Collaborate with us',
  'من نحن': 'About us',
  'عرض الكل': 'View all',
  'اكتشف المزيد': 'Discover more',
  'اقرا المقال كاملا': 'Read the full article',
  'الغاء الاشتراك': 'Unsubscribe',
  'الرئيسيه': 'Home',
  'تسجيل الدخول': 'Log in',
};
const key = (ar: string) => normalizeArabic(ar.trim()).replace(/[.،؟!]/g, '');

export function createDemoTranslator(latencyMs = 250): TranslationService {
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, latencyMs));
  return {
    label: 'Demo reviewer (small phrasebook, not a real AI)',
    async translate(ar) {
      await wait();
      const hit = PHRASES[key(ar)];
      if (!hit) throw new Error('The demo translator only knows a few phrases. Connect the AI backend (see README) to translate any text.');
      return hit;
    },
    async review(ar, en, glossary) {
      await wait();
      const issues = validate(ar, en, glossary);
      if (hasErrors(issues)) return { verdict: 'problem', summary: issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' ') };
      const known = PHRASES[key(ar)];
      if (known) {
        return known.toLowerCase() === en.trim().toLowerCase()
          ? { verdict: 'correct', summary: 'Matches the expected translation.' }
          : { verdict: 'problem', summary: `The expected translation is "${known}".`, suggestion: known };
      }
      return { verdict: 'unsure', summary: 'The demo reviewer cannot judge meaning for this text. Connect the AI backend for a real check.' };
    },
  };
}
