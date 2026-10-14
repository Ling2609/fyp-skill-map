// A small turning ring for actions that take a few seconds (saving, the AI finding skills). It sits inside the
// button next to words saying what is happening, so it never stands alone (15 Oct, her review: "proper loading for all";
// references.md "Loading states"). It takes the colour of the text around it.
// The words of a button while it works, with the ring in front: {busy ? <Busy>Saving…</Busy> : 'Save'}
export function Busy({ children }) {
  return <span className="inline-flex items-center gap-1.5"><Spinner size="sm" />{children}</span>
}

export default function Spinner({ size = 'md' }) {
  const sz = size === 'sm' ? 'w-3.5 h-3.5 border-2' : 'w-5 h-5 border-2'
  return <span aria-hidden="true" className={`inline-block shrink-0 ${sz} border-current border-t-transparent rounded-full animate-spin`} />
}
