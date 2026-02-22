import opentype from 'opentype.js';
import fs from 'fs';

const font = opentype.loadSync(process.env.TEMP + '/MontserratBold.ttf');

const glyphs = {};
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';

for (const char of chars) {
	const glyph = font.charToGlyph(char);
	if (!glyph || glyph.index === 0) continue;

	const path = glyph.getPath(0, 0, 1000);
	const commands = path.commands;

	let o = '';
	const fy = (y) => Math.round(-y); // flip Y: opentype Y-down → Three.js Y-up
	for (const cmd of commands) {
		if (cmd.type === 'M') {
			o += `m ${Math.round(cmd.x)} ${fy(cmd.y)} `;
		} else if (cmd.type === 'L') {
			o += `l ${Math.round(cmd.x)} ${fy(cmd.y)} `;
		} else if (cmd.type === 'Q') {
			o += `q ${Math.round(cmd.x1)} ${fy(cmd.y1)} ${Math.round(cmd.x)} ${fy(cmd.y)} `;
		} else if (cmd.type === 'C') {
			o += `b ${Math.round(cmd.x1)} ${fy(cmd.y1)} ${Math.round(cmd.x2)} ${fy(cmd.y2)} ${Math.round(cmd.x)} ${fy(cmd.y)} `;
		}
	}

	const charCode = char.charCodeAt(0);
	glyphs[charCode] = {
		o: o.trim(),
		ha: Math.round(glyph.advanceWidth * (1000 / font.unitsPerEm))
	};
}

const result = {
	glyphs,
	familyName: font.names.fontFamily?.en || 'Montserrat',
	ascender: Math.round(font.ascender * (1000 / font.unitsPerEm)),
	descender: Math.round(font.descender * (1000 / font.unitsPerEm)),
	underlinePosition: Math.round((font.tables.post?.underlinePosition || -100) * (1000 / font.unitsPerEm)),
	underlineThickness: Math.round((font.tables.post?.underlineThickness || 50) * (1000 / font.unitsPerEm)),
	boundingBox: {
		xMin: Math.round(font.tables.head.xMin * (1000 / font.unitsPerEm)),
		yMin: Math.round(font.tables.head.yMin * (1000 / font.unitsPerEm)),
		xMax: Math.round(font.tables.head.xMax * (1000 / font.unitsPerEm)),
		yMax: Math.round(font.tables.head.yMax * (1000 / font.unitsPerEm))
	},
	resolution: 1000,
	original_font_information: {
		format: 0,
		copyright: '',
		fontFamily: font.names.fontFamily?.en || 'Montserrat',
		fontSubfamily: 'Bold',
		fullName: 'Montserrat Bold'
	},
	cssFontWeight: 'bold',
	cssFontStyle: 'normal'
};

fs.writeFileSync('static/fonts/montserrat_bold.typeface.json', JSON.stringify(result));
console.log('Done! Glyphs:', Object.keys(glyphs).length);
