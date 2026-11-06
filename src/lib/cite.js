// Formats a passage for the clipboard. Each format yields plain text, plus HTML where a link should stay
// clickable when pasted into a rich editor (docs, email, chat).

export const CITE_FORMATS = [
  { id: 'reference', label: 'Reference' },
  { id: 'link', label: 'Link' },
  { id: 'linked-reference', label: 'Linked reference' },
  { id: 'text', label: 'Text and reference' },
  { id: 'text-linked', label: 'Text and linked reference' },
  { id: 'markdown', label: 'Markdown' }
]

const escapeHtml = value => value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])
const quote = texts => `“${texts.join(' ')}”`
const anchor = (reference, url) => `<a href="${escapeHtml(url)}">${escapeHtml(reference)}</a>`

// passage: { reference: 'John 3:16', url, texts: ['For God so loved…'] }
export const cite = ({ reference, url, texts }, format) => {
  switch (format) {
    case 'reference': return { text: reference }
    case 'link': return { text: url }
    case 'linked-reference': return { text: `${reference} (${url})`, html: anchor(reference, url) }
    case 'text': return { text: `${quote(texts)} (${reference})` }
    case 'text-linked': return {
      text: `${quote(texts)} (${reference})\n${url}`,
      html: `${escapeHtml(quote(texts))} (${anchor(reference, url)})`
    }
    case 'markdown': return { text: `> ${quote(texts)}\n>\n> — [${reference}](${url})` }
    default: throw new Error(`Unknown citation format: ${format}`)
  }
}
