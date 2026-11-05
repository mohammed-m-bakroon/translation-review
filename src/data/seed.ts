import type { GlossaryTerm, TranslationItem } from '../domain';

const t = '2026-10-20T09:00:00.000Z';

export const GLOSSARY: GlossaryTerm[] = [
  { ar: 'منصة صوت', en: 'Sawt', note: 'Brand name: never translate it literally as "Voice Platform".' },
  { ar: 'غزة', en: 'Gaza' },
  { ar: 'صناع المحتوى', en: 'content creators', note: 'Prefer "creators" or "content creators", not "makers".' },
];

export const SEED_ITEMS: TranslationItem[] = [
  { id: 'home.hero.title', group: 'home', ar: 'من غزة، حكايات تستحق أن تُروى', en: 'From Gaza, stories worth telling', status: 'approved', updatedAt: t, reviewer: 'Mohammed' },
  { id: 'home.hero.subtitle', group: 'home', ar: 'ننقل قصص الناس وقضاياهم بصدق، ونصنع محتوى إنسانياً يمنح الأصوات المهمشة مساحة لتصل إلى العالم.', en: 'We tell people’s stories and causes with honesty, and create human content that gives marginalised voices a space to reach the world.', status: 'reviewed', updatedAt: t, reviewer: 'Mohammed' },
  { id: 'home.hero.cta_support', group: 'home', ar: 'ادعم صوت', en: 'Support Sawt', status: 'approved', updatedAt: t, reviewer: 'Mohammed' },
  { id: 'home.hero.cta_collab', group: 'home', ar: 'تعاون معنا', en: '', status: 'missing', updatedAt: t },
  { id: 'home.welcome.title', group: 'home', ar: 'نؤمن أن لكل إنسان قصة تستحق أن تُروى', en: 'admin@admin.com', status: 'draft', updatedAt: t },
  { id: 'about.hero.title', group: 'about', ar: 'الفريق خلف منصة صوت', en: 'The team behind the Voice Platform', status: 'draft', updatedAt: t },
  { id: 'about.intro', group: 'about', ar: 'فريق منصة صوت حاضنة لأصوات غزة. لم نبدأ من فكرة خارقة، بل من قرار بسيط: أن نكون حاضرين ونستمع.', en: 'The Sawt team is an incubator for the voices of Gaza. We did not start from an extraordinary idea, but from a simple decision: to be present and to listen.', status: 'reviewed', updatedAt: t, reviewer: 'Mohammed' },
  { id: 'about.join.title', group: 'about', ar: 'لأن بعض الأصوات لا يجب أن تُنسى', en: 'Because some voices must never be forgotten', status: 'approved', updatedAt: t, reviewer: 'Mohammed' },
  { id: 'creators.title', group: 'creators', ar: 'صناع المحتوى في صوت', en: 'Makers of content at Sawt', status: 'draft', updatedAt: t },
  { id: 'creators.collab.step1', group: 'creators', ar: 'استعرض ملفات صناعنا وفلتر حسب التخصص والميزانية والوصول الجماهيري', en: 'Browse our creators’ profiles and filter by specialty, budget, and audience reach', status: 'reviewed', updatedAt: t, reviewer: 'Mohammed' },
  { id: 'creators.collab.step2', group: 'creators', ar: 'فريق صوت ميديا يتولى التنسيق الكامل بينك وبين صانع المحتوى', en: '', status: 'missing', updatedAt: t },
  { id: 'donate.thanks', group: 'donate', ar: 'شكراً :name على دعمك بمبلغ :amount', en: 'Thank you for your support, :name.', status: 'draft', updatedAt: t },
  { id: 'donate.min_amount', group: 'donate', ar: 'الحد الأدنى للتبرع هو {amount} دولار', en: 'The minimum donation is {amount} dollars', status: 'approved', updatedAt: t, reviewer: 'Mohammed' },
  { id: 'stories.badge', group: 'stories', ar: '+100 قصة واقعية نقلتها صوت إلى العالم', en: '100+ real stories Sawt has carried to the world', status: 'reviewed', updatedAt: t, reviewer: 'Mohammed' },
];
