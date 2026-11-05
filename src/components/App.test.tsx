import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { TranslationProvider } from '../state/TranslationProvider';
import type { TranslationApi } from '../data/api';
import type { GlossaryTerm, TranslationItem } from '../domain';
import type { TranslationService } from '../data/translator';

const glossary: GlossaryTerm[] = [{ ar: 'غزة', en: 'Gaza' }];
const base = { group: 'home', updatedAt: 't' } as const;
const items: TranslationItem[] = [
  { ...base, id: 'home.title', ar: 'من غزة', en: 'From Gaza', status: 'draft' },
  { ...base, id: 'home.cta', ar: 'تعاون معنا', en: '', status: 'missing' },
  { ...base, id: 'about.bad', ar: 'نحن في غزة', en: 'We are here', status: 'draft' },
];

const quietService = (over: Partial<TranslationService> = {}): TranslationService => ({
  label: 'Test AI',
  translate: () => Promise.resolve('Translated'),
  review: () => Promise.resolve({ verdict: 'unsure', summary: 'Cannot tell.' }),
  ...over,
});

function setup(overrides: Partial<TranslationApi> = {}, service: TranslationService = quietService()) {
  const save = vi.fn().mockResolvedValue(undefined);
  const ok = () => vi.fn().mockResolvedValue(undefined);
  const api: TranslationApi = {
    load: () => Promise.resolve({ items, glossary }),
    save,
    remove: ok(),
    replaceAll: ok(),
    saveGlossary: ok(),
    ...overrides,
  };
  render(
    <TranslationProvider api={api} service={service} reviewDelayMs={0} now={() => '2026-11-04T10:00:00.000Z'}>
      <App />
    </TranslationProvider>,
  );
  return { save, user: userEvent.setup() };
}

describe('<App />', () => {
  it('shows a loading state, then the list', async () => {
    setup();
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    expect(await screen.findByRole('list', { name: 'Translations' })).toBeInTheDocument();
  });

  it('shows an error when loading fails', async () => {
    setup({ load: () => Promise.reject(new Error('network down')) });
    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
  });

  it('filters the list by search text', async () => {
    const { user } = setup();
    await screen.findByRole('list', { name: 'Translations' });
    await user.type(screen.getByRole('searchbox'), 'تعاون');
    const list = screen.getByRole('list', { name: 'Translations' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('home.cta')).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    const { user } = setup();
    await screen.findByRole('list', { name: 'Translations' });
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText(/no translations match/i)).toBeInTheDocument();
  });

  it('saves an edit, which drops an item back to draft and persists it', async () => {
    const { user, save } = setup();
    const box = await screen.findByLabelText('English');
    await user.clear(box);
    await user.type(box, 'Out of Gaza');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'home.title', en: 'Out of Gaza', status: 'draft' })));
  });

  it('shows a glossary error live and blocks review', async () => {
    const { user } = setup();
    await screen.findByRole('list', { name: 'Translations' });
    await user.click(screen.getByRole('button', { name: /about\.bad/ }));
    expect(screen.getByText(/must appear as "Gaza"/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark as reviewed' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/resolve all errors/i);
  });

  it('requires saving before the status can change', async () => {
    const { user } = setup();
    const box = await screen.findByLabelText('English');
    await user.type(box, '!');
    expect(screen.getByRole('button', { name: 'Mark as reviewed' })).toBeDisabled();
  });

  it('moves a clean draft to reviewed', async () => {
    const { user, save } = setup();
    await screen.findByLabelText('English');
    await user.click(screen.getByRole('button', { name: 'Mark as reviewed' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'home.title', status: 'reviewed' })));
  });

  it('rolls back and warns when saving fails', async () => {
    const { user } = setup({ save: () => Promise.reject(new Error('server error')) });
    await screen.findByLabelText('English');
    await user.click(screen.getByRole('button', { name: 'Mark as reviewed' }));
    expect(await screen.findByText(/not saved and has been reverted: server error/i)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Translations' });
    expect(within(list).getAllByText('Draft').length).toBeGreaterThan(0);
  });

  it('renders Arabic text right-to-left', async () => {
    setup();
    const ar = await screen.findAllByText('من غزة');
    expect(ar.some((el) => el.getAttribute('dir') === 'rtl')).toBe(true);
  });
});

describe('<App /> management', () => {
  it('adds a new string and selects it', async () => {
    const { user, save } = setup();
    await screen.findByRole('list', { name: 'Translations' });
    await user.click(screen.getByRole('button', { name: 'Add string' }));
    const form = screen.getByRole('form', { name: 'Add a string' });
    await user.type(within(form).getByLabelText('Key'), 'footer.note');
    await user.type(within(form).getByLabelText('Arabic text'), 'جميع الحقوق محفوظة');
    await user.click(within(form).getByRole('button', { name: 'Add string' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'footer.note', status: 'missing' })));
    expect(screen.getByRole('region', { name: 'Edit footer.note' })).toBeInTheDocument();
  });

  it('rejects a duplicate key', async () => {
    const { user } = setup();
    await screen.findByRole('list', { name: 'Translations' });
    await user.click(screen.getByRole('button', { name: 'Add string' }));
    const form = screen.getByRole('form', { name: 'Add a string' });
    await user.type(within(form).getByLabelText('Key'), 'home.title');
    await user.type(within(form).getByLabelText('Arabic text'), 'نص');
    await user.click(within(form).getByRole('button', { name: 'Add string' }));
    expect(within(form).getByRole('alert')).toHaveTextContent(/already exists/);
  });

  it('deletes only after confirmation', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const { user } = setup({ remove });
    await screen.findByLabelText('English');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('home.title'));
    const list = screen.getByRole('list', { name: 'Translations' });
    expect(within(list).queryByText('home.title')).not.toBeInTheDocument();
  });

  it('imports JSON and reports what happened', async () => {
    const replaceAll = vi.fn().mockResolvedValue(undefined);
    const { user } = setup({ replaceAll });
    await screen.findByRole('list', { name: 'Translations' });
    await user.click(screen.getByRole('button', { name: 'Import' }));
    const box = screen.getByLabelText('JSON');
    await user.click(box);
    await user.paste('{"new.one":"نص جديد","home.title":"من غزة"}');
    await user.click(within(screen.getByRole('region', { name: 'Import translations' })).getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('status')).toHaveTextContent('1 added, 0 updated, 1 unchanged');
    expect(replaceAll).toHaveBeenCalledTimes(1);
  });

  it('shows an error for invalid JSON', async () => {
    const { user } = setup();
    await screen.findByRole('list', { name: 'Translations' });
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await user.click(screen.getByLabelText('JSON'));
    await user.paste('{oops');
    await user.click(within(screen.getByRole('region', { name: 'Import translations' })).getByRole('button', { name: 'Import' }));
    expect(screen.getByRole('alert')).toHaveTextContent('not valid JSON');
  });

  it('undoes an import if saving fails', async () => {
    const { user } = setup({ replaceAll: () => Promise.reject(new Error('offline')) });
    await screen.findByRole('list', { name: 'Translations' });
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await user.click(screen.getByLabelText('JSON'));
    await user.paste('{"new.one":"نص جديد"}');
    await user.click(within(screen.getByRole('region', { name: 'Import translations' })).getByRole('button', { name: 'Import' }));
    expect(await screen.findByText(/reverted: offline/)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Translations' });
    expect(within(list).queryByText('new.one')).not.toBeInTheDocument();
    expect(within(list).getByText('home.title')).toBeInTheDocument();
  });

  it('adds a glossary term that then blocks a matching string', async () => {
    const saveGlossary = vi.fn().mockResolvedValue(undefined);
    const { user } = setup({ saveGlossary });
    await screen.findByRole('list', { name: 'Translations' });
    await user.click(screen.getByRole('button', { name: 'Glossary' }));
    const panel = screen.getByRole('region', { name: 'Glossary' });
    await user.type(within(panel).getByLabelText('Arabic term'), 'تعاون');
    await user.type(within(panel).getByLabelText('Required English'), 'partner');
    await user.click(within(panel).getByRole('button', { name: 'Add term' }));
    await waitFor(() => expect(saveGlossary).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ ar: 'تعاون', en: 'partner' })])));
    await user.click(screen.getByRole('button', { name: /home\.cta/ }));
    await user.type(screen.getByLabelText('English'), 'Collaborate with us');
    expect(screen.getByText(/must appear as "partner"/)).toBeInTheDocument();
  });
});

describe('<App /> auto-translate and meaning check', () => {
  const addString = async (user: ReturnType<typeof userEvent.setup>, key: string, ar: string) => {
    await screen.findByRole('list', { name: 'Translations' });
    await user.click(screen.getByRole('button', { name: 'Add string' }));
    const form = screen.getByRole('form', { name: 'Add a string' });
    await user.type(within(form).getByLabelText('Key'), key);
    await user.type(within(form).getByLabelText('Arabic text'), ar);
    await user.click(within(form).getByRole('button', { name: 'Add string' }));
  };

  it('translates a new Arabic string automatically and marks it as a machine draft', async () => {
    const translate = vi.fn().mockResolvedValue('Gaza Profile');
    const { user, save } = setup({}, quietService({ translate }));
    await addString(user, 'user.title', 'بروفايل غزة');
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'user.title', en: 'Gaza Profile', status: 'draft', machine: true })));
    expect(translate).toHaveBeenCalledWith('بروفايل غزة', glossary);
    expect(await screen.findByText(/Machine draft/)).toBeInTheDocument();
    expect(screen.getByLabelText('English')).toHaveValue('Gaza Profile');
  });

  it('does not translate when the box is unticked', async () => {
    const translate = vi.fn().mockResolvedValue('x');
    const { user } = setup({}, quietService({ translate }));
    await screen.findByRole('list', { name: 'Translations' });
    await user.click(screen.getByRole('button', { name: 'Add string' }));
    const form = screen.getByRole('form', { name: 'Add a string' });
    await user.type(within(form).getByLabelText('Key'), 'k.one');
    await user.type(within(form).getByLabelText('Arabic text'), 'نص');
    await user.click(within(form).getByRole('checkbox'));
    await user.click(within(form).getByRole('button', { name: 'Add string' }));
    await new Promise((r) => setTimeout(r, 30));
    expect(translate).not.toHaveBeenCalled();
  });

  it('keeps the string and explains when auto-translation fails', async () => {
    const { user } = setup({}, quietService({ translate: () => Promise.reject(new Error('quota exceeded')) }));
    await addString(user, 'k.fail', 'نص');
    expect(await screen.findByText(/added, but could not be translated automatically: quota exceeded/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Edit k.fail' })).toBeInTheDocument();
  });

  it('never overwrites English that a person typed while the translation was running', async () => {
    let finish!: (v: string) => void;
    const translate = vi.fn().mockReturnValue(new Promise<string>((r) => (finish = r)));
    const { user, save } = setup({}, quietService({ translate }));
    await screen.findByRole('list', { name: 'Translations' });
    await user.click(screen.getByRole('button', { name: /home\.cta/ }));
    await user.click(screen.getByRole('button', { name: 'Auto-translate' }));
    const box = screen.getByLabelText('English');
    await user.type(box, 'My own text');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ en: 'My own text' })));
    finish('Machine text');
    await new Promise((r) => setTimeout(r, 30));
    expect(save).not.toHaveBeenCalledWith(expect.objectContaining({ en: 'Machine text' }));
  });

  it('translates all missing strings and reports the result', async () => {
    const translate = vi.fn().mockResolvedValue('Auto');
    const { user, save } = setup({}, quietService({ translate }));
    await screen.findByRole('list', { name: 'Translations' });
    await user.click(screen.getByRole('button', { name: 'Translate missing (1)' }));
    expect(await screen.findByText(/Translated 1 string\. Review them/)).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'home.cta', machine: true }));
  });

  it('stops translating after the first failure and says how far it got', async () => {
    const { user } = setup({}, quietService({ translate: () => Promise.reject(new Error('no credit')) }));
    await screen.findByRole('list', { name: 'Translations' });
    await user.click(screen.getByRole('button', { name: 'Translate missing (1)' }));
    expect(await screen.findByText(/Translated 0 of 1\. Stopped: no credit/)).toBeInTheDocument();
  });

  it('shows the meaning check and applies a suggestion', async () => {
    const review = vi.fn().mockResolvedValue({ verdict: 'problem', summary: 'A word is missing.', suggestion: 'From Gaza, with love' });
    const { user } = setup({}, quietService({ review }));
    expect(await screen.findByText('Possible mistake.')).toBeInTheDocument();
    expect(screen.getByText(/A word is missing\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use suggestion' }));
    expect(screen.getByLabelText('English')).toHaveValue('From Gaza, with love');
  });

  it('re-checks the meaning when the English is edited', async () => {
    const review = vi.fn().mockResolvedValue({ verdict: 'correct', summary: 'Fine.' });
    const { user } = setup({}, quietService({ review }));
    await screen.findByText('Looks accurate.');
    await user.type(screen.getByLabelText('English'), '!');
    await waitFor(() => expect(review).toHaveBeenLastCalledWith('من غزة', 'From Gaza!', glossary, expect.anything()));
  });

  it('says so when the meaning check fails, without blocking the editor', async () => {
    setup({}, quietService({ review: () => Promise.reject(new Error('offline')) }));
    expect(await screen.findByText(/Could not check the meaning: offline/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });
});
