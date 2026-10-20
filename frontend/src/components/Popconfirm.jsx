// 20 Oct (her guide on pop-ups: a small confirm next to the button, not the browser's grey box): asks once, beside the
// thing that was clicked; the buttons say what they do. Place it inside a `relative` wrapper.
export default function Popconfirm({ text, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel, danger, align = 'left' }) {
  return (
    <div role="alertdialog" aria-label={text}
      className={`absolute z-40 top-full mt-2 ${align === 'right' ? 'right-0' : 'left-0'} w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-3`}>
      <p className="text-sm text-slate-700">{text}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} autoFocus
          className="text-sm font-medium text-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50">{cancelLabel}</button>
        <button type="button" onClick={onConfirm}
          className={`text-sm font-medium text-white rounded-lg px-3 py-1.5 ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-700 hover:bg-blue-800'}`}>{confirmLabel}</button>
      </div>
    </div>
  )
}
