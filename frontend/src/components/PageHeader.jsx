// strong: a thicker line under the heading (21 Oct, her pick D: lines, not colours, tell the applicant's heading
// apart from the CV below; NN/g "Common Region": extra coloured blocks add clutter)
export default function PageHeader({ children, strong }) {
  return (
    <div className={`bg-white ${strong ? 'border-b-2 border-slate-300' : 'border-b border-slate-200'} px-4 sm:px-8 pt-5 pb-0 shrink-0`}>
      {children}
    </div>
  )
}
