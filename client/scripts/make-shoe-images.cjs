const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '../public/shoes');
fs.mkdirSync(OUT_DIR, { recursive: true });

const shoes = [
  { file: 'velocity-runner-2.svg',  accent: '#4f8cff', sole: '#2b3140' },
  { file: 'trail-grip-pro.svg',     accent: '#3ecf8e', sole: '#22303a' },
  { file: 'court-classic-low.svg',  accent: '#dfe3ea', sole: '#3a3f4b' },
  { file: 'cloudstep-recovery.svg', accent: '#b07cff', sole: '#2e2a3d' },
  { file: 'arc-trainer-x.svg',      accent: '#ff9f43', sole: '#3a3025' },
  { file: 'marathon-elite-4.svg',   accent: '#ff5c5c', sole: '#3a2626' },
];

const template = ({ accent, sole }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" role="img">
  <rect width="600" height="400" fill="#12151c"/>
  <g transform="translate(20,30)">
    <!-- upper -->
    <path d="M95 285 C95 240 140 205 205 196 L305 186 C345 181 366 160 396 140
             C428 118 462 126 478 160 L502 226 C513 256 517 276 517 288 Z"
          fill="${accent}" opacity="0.92"/>
    <!-- collar -->
    <path d="M396 140 C428 118 462 126 478 160 L466 168 C452 142 424 136 400 152 Z"
          fill="#0f1115" opacity="0.35"/>
    <!-- laces -->
    <g stroke="#0f1115" stroke-width="7" stroke-linecap="round" opacity="0.45">
      <line x1="228" y1="212" x2="268" y2="196"/>
      <line x1="258" y1="222" x2="298" y2="206"/>
      <line x1="288" y1="232" x2="328" y2="214"/>
      <line x1="318" y1="240" x2="356" y2="220"/>
    </g>
    <!-- side stripe -->
    <path d="M150 276 C200 252 250 244 300 252 L292 276 C248 270 206 278 168 296 Z"
          fill="#0f1115" opacity="0.3"/>
    <!-- midsole -->
    <path d="M72 286 L522 286 C538 286 549 297 549 310 C549 327 533 338 514 338
             L98 338 C76 338 62 325 62 310 C62 297 58 286 72 286 Z"
          fill="${sole}"/>
    <!-- outsole -->
    <path d="M64 320 L548 320 C546 331 532 338 514 338 L98 338 C78 338 66 330 64 320 Z"
          fill="#0b0d12"/>
  </g>
</svg>`;

for (const shoe of shoes) {
  fs.writeFileSync(path.join(OUT_DIR, shoe.file), template(shoe), 'utf8');
  console.log('wrote', shoe.file);
}