/**
 * Filled metric glyphs used by the dashboard tiles, inlined from their icon sets:
 *   - BarsStaggeredIcon, PercentIcon — Font Awesome Free 7 (Solid) by Fonticons, Inc.,
 *     licensed CC BY 4.0 — https://fontawesome.com/license/free
 *   - ChartPieSliceIcon — Glyphs by Goran Spasojevic, MIT
 *   - TargetArrowIcon — Fluent UI System Icons, © Microsoft Corporation, MIT
 *   - PasswordIcon — Google Material Icons, © Google, Apache License 2.0
 *   - PaidIcon — Google Material Symbols, © Google, Apache License 2.0
 *   - SidebarToggleIcon — Bootstrap Icons, © The Bootstrap Authors, MIT
 *   - FlagstickIcon — Pinhead Map Icons by Quincy Morgan, CC0 1.0
 *   - ArrowRightIcon — Charm Icons by Jay Newey, MIT
 */
import React from 'react'

const Glyph = ({ size = 16, viewBox, children, ...rest }) =>
  <svg width={size} height={size} viewBox={viewBox} fill="currentColor" aria-hidden="true" {...rest}>{children}</svg>

export const BarsStaggeredIcon = (props) => <Glyph viewBox="0 0 640 640" {...props}>
  <path d="M64 160c0-17.7 14.3-32 32-32h384c17.7 0 32 14.3 32 32s-14.3 32-32 32H96c-17.7 0-32-14.3-32-32m64 160c0-17.7 14.3-32 32-32h384c17.7 0 32 14.3 32 32s-14.3 32-32 32H160c-17.7 0-32-14.3-32-32m384 160c0 17.7-14.3 32-32 32H96c-17.7 0-32-14.3-32-32s14.3-32 32-32h384c17.7 0 32 14.3 32 32"/>
</Glyph>

export const PercentIcon = (props) => <Glyph viewBox="0 0 640 640" {...props}>
  <path d="M288 192c0-53-43-96-96-96s-96 43-96 96s43 96 96 96s96-43 96-96m256 256c0-53-43-96-96-96s-96 43-96 96s43 96 96 96s96-43 96-96m-9.4-297.4c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-384 384c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0z"/>
</Glyph>

export const ChartPieSliceIcon = (props) => <Glyph viewBox="0 0 80 80" {...props}>
  <path d="M48 30a2 2 0 0 0 2 2h18.174c1.104 0 2.009-.897 1.91-1.997A22.17 22.17 0 0 0 49.998 9.917c-1.1-.1-1.998.805-1.998 1.91z"/>
  <path d="M30.101 16.1a25.9 25.9 0 0 1 7.901-1.892c1.102-.085 1.998.819 1.998 1.923v21.87a2 2 0 0 0 2 2h21.87c1.104 0 2.007.896 1.922 1.997A25.869 25.869 0 1 1 30.102 16.1"/>
</Glyph>

export const TargetArrowIcon = (props) => <Glyph viewBox="0 0 16 16" {...props}>
  <path d="M12 1.5a.5.5 0 0 0-.854-.354l-2 2A.5.5 0 0 0 9 3.5v2.793l-.741.74A1.002 1.002 0 0 0 7 8a1 1 0 1 0 1.966-.259L9.707 7H12.5a.5.5 0 0 0 .354-.146l2-2A.5.5 0 0 0 14.5 4H12zm1.944 5.678Q14 7.58 14 8a6 6 0 1 1-5.177-5.944l-.383.383A1.5 1.5 0 0 0 8 3.5A4.5 4.5 0 1 0 12.5 8a1.5 1.5 0 0 0 1.06-.44zM8 4.5A3.5 3.5 0 1 0 11.5 8h-1.379l-.125.125a2 2 0 1 1-2.121-2.121L8 5.879z"/>
</Glyph>

export const PaidIcon = (props) => <Glyph viewBox="0 0 24 24" {...props}>
  <path d="M11.1 19h1.75v-1.25q1.25-.225 2.15-.975t.9-2.225q0-1.05-.6-1.925T12.9 11.1q-1.5-.5-2.075-.875T10.25 9.2t.463-1.025T12.05 7.8q.8 0 1.25.387t.65.963l1.6-.65q-.275-.875-1.012-1.525T12.9 6.25V5h-1.75v1.25q-1.25.275-1.95 1.1T8.5 9.2q0 1.175.688 1.9t2.162 1.25q1.575.575 2.188 1.025t.612 1.175q0 .825-.587 1.213t-1.413.387t-1.463-.512T9.75 14.1l-1.65.65q.35 1.2 1.088 1.938T11.1 17.7zm.9 3q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22"/>
</Glyph>

export const PasswordIcon = (props) => <Glyph viewBox="0 0 24 24" {...props}>
  <path d="M2 17h20v2H2zm1.15-4.05L4 11.47l.85 1.48l1.3-.75l-.85-1.48H7v-1.5H5.3l.85-1.47L4.85 7L4 8.47L3.15 7l-1.3.75l.85 1.47H1v1.5h1.7l-.85 1.48zm6.7-.75l1.3.75l.85-1.48l.85 1.48l1.3-.75l-.85-1.48H15v-1.5h-1.7l.85-1.47l-1.3-.75L12 8.47L11.15 7l-1.3.75l.85 1.47H9v1.5h1.7zM23 9.22h-1.7l.85-1.47l-1.3-.75L20 8.47L19.15 7l-1.3.75l.85 1.47H17v1.5h1.7l-.85 1.48l1.3.75l.85-1.48l.85 1.48l1.3-.75l-.85-1.48H23z"/>
</Glyph>

export const FlagstickIcon = (props) => <Glyph viewBox="0 0 15 15" {...props}>
  <path d="M4.5 10.16v1.3c-.65.08-1.25.25-1.25.54c0 .45 1.38.6 2.25.6s2.25-.15 2.25-.6c0-.29-.6-.46-1.25-.54v-1.44c.32-.01.66-.02 1-.02c4.5 0 7.5 1 7.5 2s-3 2-7.5 2S0 13 0 12c0-.76 1.72-1.51 4.5-1.84M5.5 0c.28 0 .5.22.5.5V12H5V.5c0-.28.22-.5.5-.5m1 .5c.53.51 1.17.9 1.91 1.18c.74.27 2.44.47 5.09.59c-1.52 1.58-2.79 2.57-3.82 2.95q-1.53.555-3.18 0z"/>
</Glyph>

/** Duotone dock glyphs: a soft base shape plus a solid mark, drawn in currentColor. */
export const ShieldRiskIcon = (props) => <Glyph viewBox="0 0 24 24" {...props}>
  <path opacity=".38" d="M12 2.2 4 5.4v6.1c0 4.9 3.4 8.6 8 10.3 4.6-1.7 8-5.4 8-10.3V5.4z"/>
  <path d="M12 6.6a1.1 1.1 0 0 1 1.1 1.1v4.6a1.1 1.1 0 0 1-2.2 0V7.7A1.1 1.1 0 0 1 12 6.6m0 8.1a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5"/>
</Glyph>

export const BufferGaugeIcon = (props) => <Glyph viewBox="0 0 24 24" {...props}>
  <path opacity=".38" d="M12 4a9 9 0 0 0-9 9 8.9 8.9 0 0 0 1.2 4.5h3.2A6 6 0 1 1 18 13h3a9 9 0 0 0-9-9"/>
  <path d="M16.4 8.9a1.1 1.1 0 0 1 .2 1.6l-3.1 3.8a1.7 1.7 0 1 1-1.8-1.4l3.1-3.8a1.1 1.1 0 0 1 1.6-.2"/>
</Glyph>

export const TargetProgressIcon = (props) => <Glyph viewBox="0 0 24 24" {...props}>
  <path opacity=".26" d="M12 2.6a9.4 9.4 0 1 1 0 18.8 9.4 9.4 0 0 1 0-18.8"/>
  <path d="M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8m0 2.3a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2"/>
  <path d="M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5"/>
</Glyph>

export const SidebarToggleIcon = (props) => <Glyph viewBox="0 0 16 16" {...props}>
  <path d="M2 2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zm12-1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z"/>
  <path d="M14 3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z"/>
</Glyph>

export const ArrowRightIcon = ({ size = 16, ...rest }) =>
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" {...rest}>
    <path d="m8.75 3.25 4.5 4.5-4.5 4.5m-6-4.5h10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
