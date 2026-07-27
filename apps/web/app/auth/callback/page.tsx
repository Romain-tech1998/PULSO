export default function AuthCallbackPage() {
  return (
    <div className="redirect-shell">
      <p role="status">Connexion en cours…</p>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            var token = new URLSearchParams(window.location.search).get('token');
            if (token) localStorage.setItem('pulso-auth-token', token);
            window.location.replace('/');
          `
        }}
      />
    </div>
  );
}
