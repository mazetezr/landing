export interface Env {
	TG_BOT_TOKEN: string;
	TG_CHAT_ID: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST',
					'Access-Control-Allow-Headers': 'Content-Type',
				},
			});
		}

		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 });
		}

		try {
			const data = await request.json() as Record<string, string>;

			const lines = [
				`📋 *New Project Request*`,
				``,
				`*Project:* ${data.projectName || ''}`,
				`*Name:* ${data.fullName || ''}`,
				`*Email:* ${data.email || ''}`,
				data.telegram ? `*Telegram:* ${data.telegram}` : '',
				data.whatsapp ? `*WhatsApp:* ${data.whatsapp}` : '',
				``,
				`*Description:*`,
				data.description || '',
				``,
				`*Budget:* $${data.budget || ''}`,
				`*Timeline:* ${data.timeline || ''}`,
			].filter(Boolean).join('\n');

			const res = await fetch(
				`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						chat_id: env.TG_CHAT_ID,
						text: lines,
						parse_mode: 'Markdown',
					}),
				}
			);

			if (!res.ok) {
				return new Response('Telegram error', {
					status: 502,
					headers: { 'Access-Control-Allow-Origin': '*' },
				});
			}

			return new Response(JSON.stringify({ ok: true }), {
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			});
		} catch {
			return new Response('Bad request', {
				status: 400,
				headers: { 'Access-Control-Allow-Origin': '*' },
			});
		}
	},
};
