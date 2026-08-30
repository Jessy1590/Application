import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Attachment = { filename: string; content: string; contentType?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      db: { schema: 'portail' },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Session invalide' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'équipe'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Accès réservé au personnel pharmacie' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { to, subject, html, text, attachments } = body as {
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
      attachments?: Attachment[];
    };

    if (!to || !subject || (!html && !text)) {
      return new Response(JSON.stringify({ error: 'to, subject et html/text requis' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const toList = Array.isArray(to) ? to : [to];
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const smtpFrom = Deno.env.get('SMTP_FROM') || Deno.env.get('RESEND_FROM') || 'noreply@pharmaos.local';

    if (resendKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: smtpFrom,
          to: toList,
          subject,
          html: html || undefined,
          text: text || undefined,
          attachments: attachments?.map((a) => ({
            filename: a.filename,
            content: a.content,
            content_type: a.contentType,
          })),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: result?.message || 'Échec Resend', detail: result }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, provider: 'resend', id: result.id }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fallback SMTP via Deno connect (simple AUTH LOGIN) — préférer Resend en prod
    const host = Deno.env.get('SMTP_HOST');
    const port = Number(Deno.env.get('SMTP_PORT') || '587');
    const smtpUser = Deno.env.get('SMTP_USER');
    const smtpPass = Deno.env.get('SMTP_PASS');

    if (!host || !smtpUser || !smtpPass) {
      return new Response(
        JSON.stringify({
          error: 'Configurer RESEND_API_KEY ou SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Envoi via API compatible Brevo/Mailgun non implémenté ici : on utilise un relais HTTP si SMTP_HTTP_URL
    const smtpHttpUrl = Deno.env.get('SMTP_HTTP_URL');
    if (smtpHttpUrl) {
      const res = await fetch(smtpHttpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${smtpPass}` },
        body: JSON.stringify({ from: smtpFrom, to: toList, subject, html, text, attachments }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        return new Response(JSON.stringify({ error: 'Échec SMTP HTTP', detail: result }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, provider: 'smtp_http', result }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Dernier recours documenté : secrets présents mais pas de transporteur brut Deno SMTP
    return new Response(
      JSON.stringify({
        error:
          'SMTP brut non supporté dans cette function. Utilisez RESEND_API_KEY (recommandé) ou SMTP_HTTP_URL.',
        hint: { host, port, user: smtpUser },
      }),
      { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
