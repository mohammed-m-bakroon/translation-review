/** Swaps angle brackets so user text cannot close the fence and act as an instruction. */
export function fence(tag: string, value: string): string {
  if (!/^[a-z]+$/.test(tag)) throw new Error(`Invalid fence tag "${tag}".`);
  return `<${tag}>\n${neutralize(value)}\n</${tag}>`;
}

export function neutralize(value: string): string {
  return value.replaceAll('<', '‹').replaceAll('>', '›');
}

export function oneLine(value: string): string {
  return neutralize(value).replace(/[\u0000-\u001f]+/g, ' ').trim();
}
