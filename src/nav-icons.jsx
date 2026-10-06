/**
 * Sidebar navigation glyphs from Tabler Icons (MIT © Paweł Kuna) — https://icon-sets.iconify.design/tabler/ — inlined.
 * Each comes as an outline and a filled cut: the current page shows the filled one.
 */
import React from 'react'

const Tabler = ({ size = 16, strokeWidth = 1.9, filled, outline, solid, ...rest }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>{filled ? solid : outline(strokeWidth)}</svg>

export const DashboardNavIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1zM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/></>}
  solid={<><path fill="currentColor" d="M9 3a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm10 0a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zm10 0a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z"/></>}
/>

export const CalendarNavIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm12-4v4M8 3v4m-4 4h16m-9 4h1m0 0v3"/></>}
  solid={<><g fill="currentColor"><path d="M16 2a1 1 0 0 1 .993.883L17 3v1h1a3 3 0 0 1 2.995 2.824L21 7v12a3 3 0 0 1-2.824 2.995L18 22H6a3 3 0 0 1-2.995-2.824L3 19V7a3 3 0 0 1 2.824-2.995L6 4h1V3a1 1 0 0 1 1.993-.117L9 3v1h6V3a1 1 0 0 1 1-1m3 7H5v9.625c0 .705.386 1.286.883 1.366L6 20h12c.513 0 .936-.53.993-1.215l.007-.16z"/><path d="M12 12a1 1 0 0 1 .993.883L13 13v3a1 1 0 0 1-1.993.117L11 16v-2a1 1 0 0 1-.117-1.993L11 12z"/></g></>}
/>

export const JournalNavIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}><path d="M7 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1"/><path d="M20.385 6.585a2.1 2.1 0 0 0-2.97-2.97L9 12v3h3zM16 5l3 3"/></g></>}
  solid={<><g fill="currentColor"><path d="M8 7a1 1 0 0 1-1 1H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1a1 1 0 0 1 2 0v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h1a1 1 0 0 1 1 1"/><path d="m14.596 5.011l4.392 4.392l-6.28 6.303A1 1 0 0 1 12 16H9a1 1 0 0 1-1-1v-3a1 1 0 0 1 .294-.708zm6.496-2.103a3.097 3.097 0 0 1 .165 4.203l-.164.18l-.693.694l-4.387-4.387l.695-.69a3.1 3.1 0 0 1 4.384 0"/></g></>}
/>

export const TradesNavIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-3-2l-2 2l-2-2l-2 2l-2-2zM9 7h6m-6 4h6m-2 4h2"/></>}
  solid={<><path fill="currentColor" d="M17 2a3 3 0 0 1 3 3v16a1 1 0 0 1-1.555.832l-2.318-1.545l-1.42 1.42a1 1 0 0 1-1.32.083l-.094-.083L12 20.415l-1.293 1.292a1 1 0 0 1-1.32.083l-.094-.083l-1.421-1.42l-2.317 1.545l-.019.012l-.054.03l-.028.017l-.054.023l-.05.023l-.049.015l-.06.019l-.052.009l-.057.011l-.084.006l-.026.003H5l-.049-.003h-.039l-.013-.003h-.016l-.041-.008l-.038-.005l-.015-.005l-.018-.002l-.034-.011l-.04-.01l-.019-.007l-.015-.004l-.029-.013l-.04-.015l-.021-.011l-.013-.005l-.028-.016l-.036-.018l-.014-.01l-.018-.01l-.038-.027l-.022-.014l-.01-.009l-.02-.014l-.045-.041l-.012-.008l-.024-.024l-.035-.039l-.02-.02l-.007-.011l-.011-.012l-.032-.045l-.02-.025l-.012-.019l-.03-.054l-.017-.028l-.023-.054l-.023-.05a1 1 0 0 1-.034-.108l-.01-.057l-.01-.053L4 21V5a3 3 0 0 1 3-3zm-2 12h-2a1 1 0 0 0 0 2h2a1 1 0 0 0 0-2m0-4H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2m0-4H9a1 1 0 1 0 0 2h6a1 1 0 0 0 0-2"/></>}
/>

export const PropFirmsNavIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm5-2V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-4 5v.01"/><path d="M3 13a20 20 0 0 0 18 0"/></g></>}
  solid={<><path fill="currentColor" d="M22 13.478V18a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-4.522l.553.277a21 21 0 0 0 18.897-.002zM14 2a3 3 0 0 1 3 3v1h2a3 3 0 0 1 3 3v2.242l-1.447.724a19 19 0 0 1-16.726.186l-.647-.32l-1.18-.59V9a3 3 0 0 1 3-3h2V5a3 3 0 0 1 3-3zm-2 8a1 1 0 0 0-1 1a1 1 0 1 0 2 .01c0-.562-.448-1.01-1-1.01m2-6h-4a1 1 0 0 0-1 1v1h6V5a1 1 0 0 0-1-1"/></>}
/>

export const ReportsNavIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}><path d="M10 3.2A9 9 0 1 0 20.8 14a1 1 0 0 0-1-1H13a2 2 0 0 1-2-2V4a.9.9 0 0 0-1-.8"/><path d="M15 3.5A9 9 0 0 1 20.5 9H16a1 1 0 0 1-1-1z"/></g></>}
  solid={<><g fill="currentColor"><path d="M9.883 2.207a1.9 1.9 0 0 1 2.087 1.522l.025.167L12 4v7a1 1 0 0 0 .883.993L13 12h6.8a2 2 0 0 1 2 2a1 1 0 0 1-.026.226A10 10 0 1 1 9.504 2.293l.27-.067z"/><path d="M14 3.5V9a1 1 0 0 0 1 1h5.5a1 1 0 0 0 .943-1.332a10 10 0 0 0-6.11-6.111A1 1 0 0 0 14 3.5"/></g></>}
/>

export const NotebookNavIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2M9 9h1m-1 4h6m-6 4h6"/></g></>}
  solid={<><g fill="currentColor"><path d="m12 2l.117.007a1 1 0 0 1 .876.876L13 3v4l.005.15a2 2 0 0 0 1.838 1.844L15 9h4l.117.007a1 1 0 0 1 .876.876L20 10v9a3 3 0 0 1-2.824 2.995L17 22H7a3 3 0 0 1-2.995-2.824L4 19V5a3 3 0 0 1 2.824-2.995L7 2zm3 14H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2m0-4H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2m-5-4H9a1 1 0 1 0 0 2h1a1 1 0 0 0 0-2"/><path d="M19 7h-4l-.001-4.001z"/></g></>}
/>

export const PlaybooksNavIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0M3 6v13m9-13v13m9-13v13"/></>}
  solid={<><path fill="currentColor" d="M21.5 5.134a1 1 0 0 1 .493.748L22 6v13a1 1 0 0 1-1.5.866A8 8 0 0 0 13 19.6V4.426a10 10 0 0 1 8.5.708M11 4.427l.001 15.174a8 8 0 0 0-7.234.117l-.327.18l-.103.044l-.049.016l-.11.026l-.061.01L3 20h-.042l-.11-.012l-.077-.014l-.108-.032l-.126-.056l-.095-.056l-.089-.067l-.06-.056l-.073-.082l-.064-.089l-.022-.036l-.032-.06l-.044-.103l-.016-.049l-.026-.11l-.01-.061l-.004-.049L2 6a1 1 0 0 1 .5-.866a10 10 0 0 1 8.5-.707"/></>}
/>

/**
 * Task progress, drawn in Tabler's style after Carbon's task-progress (a clipboard with a half-full progress
 * dot): outline cut for the sidebar, filled cut for the current page.
 */
export const ProgressNavIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M19 12V7a2 2 0 0 0-2-2h-2"/>
    <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2"/>
    <path d="M14 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0"/>
    <path fill="currentColor" stroke="none" d="M17.5 14a3.5 3.5 0 0 1 0 7z"/>
  </g>}
  solid={<>
    <path fill="currentColor" d="M7 4h1.17A3 3 0 0 0 11 6h2a3 3 0 0 0 2.83-2H17a3 3 0 0 1 3 3v4.4A5.5 5.5 0 0 0 12.4 22H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3"/>
    <path fill="currentColor" d="M11 2h2a2 2 0 1 1 0 4h-2a2 2 0 1 1 0-4"/>
    <path fill="none" stroke="currentColor" strokeWidth={1.8} d="M14 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0"/>
    <path fill="currentColor" d="M17.5 14a3.5 3.5 0 0 1 0 7z"/>
  </>}
/>

export const ImportNavIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2m-5-4v-6"/><path d="M9.5 14.5L12 17l2.5-2.5"/></g></>}
  solid={<><path fill="currentColor" d="m12 2l.117.007a1 1 0 0 1 .876.876L13 3v4l.005.15a2 2 0 0 0 1.838 1.844L15 9h4l.117.007a1 1 0 0 1 .876.876L20 10v9a3 3 0 0 1-2.824 2.995L17 22H7a3 3 0 0 1-2.995-2.824L4 19V5a3 3 0 0 1 2.824-2.995L7 2zm0 8a1 1 0 0 0-1 1v3.585l-.793-.792a1 1 0 0 0-1.32-.083l-.094.083a1 1 0 0 0 0 1.414l2.5 2.5l.044.042l.068.055l.11.071l.114.054l.105.035l.15.03L12 18l.117-.007l.117-.02l.108-.033l.081-.034l.098-.052l.092-.064l.094-.083l2.5-2.5a1 1 0 0 0 0-1.414l-.094-.083a1 1 0 0 0-1.32.083l-.793.791V11a1 1 0 0 0-.883-.993zm2.999-7.001L19 7h-4z"/></>}
/>

export const AccountsNavIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zm0 2h18M7 15h.01M11 15h2"/></>}
  solid={<><path fill="currentColor" d="M22 10v6a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-6zM7.01 14H7a1 1 0 1 0 .01 2a1 1 0 0 0 0-2M13 14h-2a1 1 0 0 0 0 2h2a1 1 0 0 0 0-2m5-10a4 4 0 0 1 4 4H2a4 4 0 0 1 4-4z"/></>}
/>

export const SettingsNavIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0"/></g></>}
  solid={<><path fill="currentColor" d="M14.647 4.081a.724.724 0 0 0 1.08.448c2.439-1.485 5.23 1.305 3.745 3.744a.724.724 0 0 0 .447 1.08c2.775.673 2.775 4.62 0 5.294a.724.724 0 0 0-.448 1.08c1.485 2.439-1.305 5.23-3.744 3.745a.724.724 0 0 0-1.08.447c-.673 2.775-4.62 2.775-5.294 0a.724.724 0 0 0-1.08-.448c-2.439 1.485-5.23-1.305-3.745-3.744a.724.724 0 0 0-.447-1.08c-2.775-.673-2.775-4.62 0-5.294a.724.724 0 0 0 .448-1.08c-1.485-2.439 1.305-5.23 3.744-3.745a.722.722 0 0 0 1.08-.447c.673-2.775 4.62-2.775 5.294 0M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6"/></>}
/>

export const MoreNavIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M4 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0m7 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0m7 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0"/></>}
  solid={<><path fill="currentColor" d="M7 12a2 2 0 1 1-4 0q0-.053.005-.102A1.996 1.996 0 0 1 5 10a2 2 0 0 1 2 2m7 0a2 2 0 1 1-4 0q0-.053.005-.102A1.996 1.996 0 0 1 12 10a2 2 0 0 1 2 2m7 0a2 2 0 1 1-4 0q0-.053.005-.102A1.996 1.996 0 0 1 19 10a2 2 0 0 1 2 2"/></>}
/>

/* Settings sections, from the same Tabler set and in the same two cuts as the sidebar. */
export const GeneralSetIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M12 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 6h8m4 0h4M6 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0m-2 0h2m4 0h10m-5 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 18h11m4 0h1"/></>}
  solid={<><path fill="currentColor" d="M17 15c1.306 0 2.418.835 2.83 2H20a1 1 0 0 1 0 2h-.171a3.001 3.001 0 0 1-5.658 0H4a1 1 0 0 1 0-2h10.173c.41-1.165 1.52-2 2.827-2M8 9c1.306 0 2.418.835 2.83 2H20a1 1 0 0 1 0 2h-9.171a3.001 3.001 0 0 1-5.658 0H4a1 1 0 0 1 0-2h1.173C5.583 9.835 6.693 9 8 9m6-6c1.306 0 2.418.835 2.83 2H20a1 1 0 0 1 0 2h-3.171a3.001 3.001 0 0 1-5.658 0H4a1 1 0 1 1 0-2h7.173c.41-1.165 1.52-2 2.827-2"/></>}
/>

export const BellSetIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6M9 17v1a3 3 0 0 0 6 0v-1"/></>}
  solid={<><path fill="currentColor" d="M14.235 19c.865 0 1.322 1.024.745 1.668A4 4 0 0 1 12 22a4 4 0 0 1-2.98-1.332c-.552-.616-.158-1.579.634-1.661l.11-.006zM12 2c1.358 0 2.506.903 2.875 2.141l.046.171l.008.043a8.01 8.01 0 0 1 4.024 6.069l.028.287L19 11v2.931l.021.136a3 3 0 0 0 1.143 1.847l.167.117l.162.099c.86.487.56 1.766-.377 1.864L20 18H4c-1.028 0-1.387-1.364-.493-1.87a3 3 0 0 0 1.472-2.063L5 13.924l.001-2.97A8 8 0 0 1 8.822 4.5l.248-.146l.01-.043a3 3 0 0 1 2.562-2.29l.182-.017z"/></>}
/>

export const CalcSetIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 8a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1zm0 6v.01m4-.01v.01m4-.01v.01M8 17v.01m4-.01v.01m4-.01v.01"/></g></>}
  solid={<><path fill="currentColor" d="M18 2a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zM8 17a1 1 0 0 0-1 1l.007.127A1 1 0 0 0 9 18.01l-.007-.127A1 1 0 0 0 8 17m4 0a1 1 0 0 0-1 1l.007.127A1 1 0 0 0 13 18.01l-.007-.127A1 1 0 0 0 12 17m4 0a1 1 0 0 0-1 1l.007.127A1 1 0 0 0 17 18.01l-.007-.127A1 1 0 0 0 16 17m-8-4a1 1 0 0 0-1 1l.007.127A1 1 0 0 0 9 14.01l-.007-.127A1 1 0 0 0 8 13m4 0a1 1 0 0 0-1 1l.007.127A1 1 0 0 0 13 14.01l-.007-.127A1 1 0 0 0 12 13m4 0a1 1 0 0 0-1 1l.007.127A1 1 0 0 0 17 14.01l-.007-.127A1 1 0 0 0 16 13m-1-7H9a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2"/></>}
/>

export const GoalSetIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M5 5a5 5 0 0 1 7 0a5 5 0 0 0 7 0v9a5 5 0 0 1-7 0a5 5 0 0 0-7 0zm0 16v-7"/></>}
  solid={<><path fill="currentColor" d="M4 5a1 1 0 0 1 .3-.714a6 6 0 0 1 8.213-.176l.351.328a4 4 0 0 0 5.272 0l.249-.227c.61-.483 1.527-.097 1.61.676L20 5v9a1 1 0 0 1-.3.714a6 6 0 0 1-8.213.176l-.351-.328A4 4 0 0 0 6 14.448V21a1 1 0 0 1-1.993.117L4 21z"/></>}
/>

export const RulesSetIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M11.46 20.846A12 12 0 0 1 3.5 6A12 12 0 0 0 12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-.09 7.06M15 19l2 2l4-4"/></>}
  solid={<><path fill="currentColor" d="m11.998 2l.118.007l.059.008l.061.013l.111.034a1 1 0 0 1 .217.112l.104.082l.255.218a11 11 0 0 0 7.189 2.537l.342-.01a1 1 0 0 1 1.005.717a13 13 0 0 1-9.208 16.25a1 1 0 0 1-.502 0A13 13 0 0 1 2.54 5.718a1 1 0 0 1 1.005-.717a11 11 0 0 0 7.531-2.527l.263-.225l.096-.075a1 1 0 0 1 .217-.112l.112-.034a1 1 0 0 1 .119-.021zm3.71 7.293a1 1 0 0 0-1.415 0L11 12.585l-1.293-1.292l-.094-.083a1 1 0 0 0-1.32 1.497l2 2l.094.083a1 1 0 0 0 1.32-.083l4-4l.083-.094a1 1 0 0 0-.083-1.32z"/></>}
/>

export const TagSetIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}><path d="M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0"/><path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592-5.592a2.41 2.41 0 0 0 0-3.408l-7.71-7.71A2 2 0 0 0 11.172 3H6a3 3 0 0 0-3 3"/></g></>}
  solid={<><path fill="currentColor" d="M11.172 2a3 3 0 0 1 2.121.879l7.71 7.71a3.41 3.41 0 0 1 0 4.822l-5.592 5.592a3.41 3.41 0 0 1-4.822 0l-7.71-7.71A3 3 0 0 1 2 11.172V6a4 4 0 0 1 4-4zM7.5 5.5a2 2 0 0 0-1.995 1.85L5.5 7.5a2 2 0 1 0 2-2"/></>}
/>

export const AiSetIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2m0-12a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2M9 18a6 6 0 0 1 6-6a6 6 0 0 1-6-6a6 6 0 0 1-6 6a6 6 0 0 1 6 6"/></>}
  solid={<><path fill="currentColor" d="M16 19a1 1 0 0 1 0-2a1 1 0 0 0 1-1c0-1.333 2-1.333 2 0a1 1 0 0 0 1 1c1.333 0 1.333 2 0 2a1 1 0 0 0-1 1c0 1.333-2 1.333-2 0a1 1 0 0 0-1-1M3 11a5 5 0 0 0 5-5c0-1.333 2-1.333 2 0a5 5 0 0 0 5 5c1.333 0 1.333 2 0 2a5 5 0 0 0-5 5a1 1 0 0 1-2 0a5 5 0 0 0-5-5c-1.333 0-1.333-2 0-2m13-4a1 1 0 0 1 0-2a1 1 0 0 0 1-1c0-1.333 2-1.333 2 0a1 1 0 0 0 1 1c1.333 0 1.333 2 0 2a1 1 0 0 0-1 1c0 1.333-2 1.333-2 0a1 1 0 0 0-1-1"/></>}
/>

export const DataSetIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}><path d="M4 6a8 3 0 1 0 16 0A8 3 0 1 0 4 6"/><path d="M4 6v6a8 3 0 0 0 16 0V6"/><path d="M4 12v6a8 3 0 0 0 16 0v-6"/></g></>}
  solid={<><g fill="currentColor"><path d="M3 15.731C4.968 17.238 8.234 18 12 18c3.76 0 7.025-.76 9-2.252V18c0 2.425-3.895 3.936-8.693 3.998L12 22c-4.938 0-9-1.523-9-4z"/><path d="M3 9.731C4.968 11.238 8.234 12 12 12c3.76 0 7.025-.76 9-2.252V12c0 2.477-4.062 4-9 4c-4.798 0-8.77-1.438-8.979-3.795l-.016-.101L3 12z"/><path d="M12 2c1.041 0 2.044.068 2.977.198l.469.071q.84.14 1.586.348l.44.131l.075.024a11 11 0 0 1 .805.3l.199.086q.535.242.967.53q.165.11.313.225a3.8 3.8 0 0 1 .669.668l.091.128q.07.105.129.211l.07.139q.163.35.2.73L21 6c0 2.477-4.062 4-9 4c-4.798 0-8.77-1.438-8.979-3.795A1 1 0 0 1 3 6l.005-.104l.016-.1c.205-2.306 4.01-3.733 8.667-3.794z"/></g></>}
/>

export const UserSetIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></>}
  solid={<><path fill="currentColor" d="M12 2a5 5 0 1 1-5 5l.005-.217A5 5 0 0 1 12 2m2 12a5 5 0 0 1 5 5v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-1a5 5 0 0 1 5-5z"/></>}
/>

/** OpenAI's mark (Tabler brand-openai); it has no filled cut, so the current section draws it heavier. */
export const OpenAiSetIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}><path d="M11.217 19.384A3.501 3.501 0 0 0 18 18.167V13l-6-3.35"/><path d="M5.214 15.014A3.501 3.501 0 0 0 9.66 20.28L14 17.746V10.8"/><path d="M6 7.63c-1.391-.236-2.787.395-3.534 1.689a3.474 3.474 0 0 0 1.271 4.745L8 16.578l6-3.348"/><path d="M12.783 4.616A3.501 3.501 0 0 0 6 5.833V10.9l6 3.45"/><path d="M18.786 8.986A3.501 3.501 0 0 0 14.34 3.72L10 6.254V13.2"/><path d="M18 16.302c1.391.236 2.787-.395 3.534-1.689a3.474 3.474 0 0 0-1.271-4.745l-4.308-2.514L10 10.774"/></g></>}
  solid={<><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}><path d="M11.217 19.384A3.501 3.501 0 0 0 18 18.167V13l-6-3.35"/><path d="M5.214 15.014A3.501 3.501 0 0 0 9.66 20.28L14 17.746V10.8"/><path d="M6 7.63c-1.391-.236-2.787.395-3.534 1.689a3.474 3.474 0 0 0 1.271 4.745L8 16.578l6-3.348"/><path d="M12.783 4.616A3.501 3.501 0 0 0 6 5.833V10.9l6 3.45"/><path d="M18.786 8.986A3.501 3.501 0 0 0 14.34 3.72L10 6.254V13.2"/><path d="M18 16.302c1.391.236 2.787-.395 3.534-1.689a3.474 3.474 0 0 0-1.271-4.745l-4.308-2.514L10 10.774"/></g></>}
/>


/** Settings → Miscellaneous: stacked layers (stack-2), with its filled cut for the current section. */
export const LayersSetIcon = (props) => <Tabler
  {...props}
  outline={(strokeWidth) => <><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M12 4L4 8l8 4l8-4zm-8 8l8 4l8-4M4 16l8 4l8-4"/></>}
  solid={<><path fill="currentColor" d="M20.894 15.553a1 1 0 0 1-.447 1.341l-8 4a1 1 0 0 1-.894 0l-8-4a1 1 0 0 1 .894-1.788L12 18.88l7.554-3.775a1 1 0 0 1 1.341.447m0-4a1 1 0 0 1-.447 1.341l-8 4a1 1 0 0 1-.894 0l-8-4a1 1 0 0 1 .894-1.788L12 14.88l7.554-3.775a1 1 0 0 1 1.341.447M12.008 3q.056 0 .111.007l.111.02l.086.024l.012.006l.012.002l.029.014l.05.019l.016.009l.012.005l8 4a1 1 0 0 1 0 1.788l-8 4a1 1 0 0 1-.894 0l-8-4a1 1 0 0 1 0-1.788l8-4l.011-.005l.018-.01l.078-.032l.011-.002l.013-.006l.086-.024l.11-.02l.056-.005z"/></>}
/>
