/**
 * Filled metric glyphs used by the dashboard tiles, inlined from their icon sets:
 *   - BarsStaggeredIcon, PercentIcon — Font Awesome Free 7 (Solid) by Fonticons, Inc.,
 *     licensed CC BY 4.0 — https://fontawesome.com/license/free
 *   - ChartPieSliceIcon — Glyphs by Goran Spasojevic, MIT
 *   - TargetArrowIcon — Fluent UI System Icons, © Microsoft Corporation, MIT
 *   - PasswordIcon — Google Material Icons, © Google, Apache License 2.0
 *   - FlagstickIcon — Pinhead Map Icons by Quincy Morgan, CC0 1.0
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

export const PasswordIcon = (props) => <Glyph viewBox="0 0 24 24" {...props}>
  <path d="M2 17h20v2H2zm1.15-4.05L4 11.47l.85 1.48l1.3-.75l-.85-1.48H7v-1.5H5.3l.85-1.47L4.85 7L4 8.47L3.15 7l-1.3.75l.85 1.47H1v1.5h1.7l-.85 1.48zm6.7-.75l1.3.75l.85-1.48l.85 1.48l1.3-.75l-.85-1.48H15v-1.5h-1.7l.85-1.47l-1.3-.75L12 8.47L11.15 7l-1.3.75l.85 1.47H9v1.5h1.7zM23 9.22h-1.7l.85-1.47l-1.3-.75L20 8.47L19.15 7l-1.3.75l.85 1.47H17v1.5h1.7l-.85 1.48l1.3.75l.85-1.48l.85 1.48l1.3-.75l-.85-1.48H23z"/>
</Glyph>

export const FlagstickIcon = (props) => <Glyph viewBox="0 0 15 15" {...props}>
  <path d="M4.5 10.16v1.3c-.65.08-1.25.25-1.25.54c0 .45 1.38.6 2.25.6s2.25-.15 2.25-.6c0-.29-.6-.46-1.25-.54v-1.44c.32-.01.66-.02 1-.02c4.5 0 7.5 1 7.5 2s-3 2-7.5 2S0 13 0 12c0-.76 1.72-1.51 4.5-1.84M5.5 0c.28 0 .5.22.5.5V12H5V.5c0-.28.22-.5.5-.5m1 .5c.53.51 1.17.9 1.91 1.18c.74.27 2.44.47 5.09.59c-1.52 1.58-2.79 2.57-3.82 2.95q-1.53.555-3.18 0z"/>
</Glyph>
