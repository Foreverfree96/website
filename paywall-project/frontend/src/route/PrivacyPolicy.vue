<template>
  <div class="privacy-page">
    <div class="privacy-container">
      <h1>Privacy Policy</h1>
      <p class="last-updated">Last Updated: April 29, 2026</p>

      <section>
        <h2>1. Introduction</h2>
        <p>
          Music Hub ("we", "our", "the Service") is committed to protecting your privacy.
          This Privacy Policy explains what information we collect, how we use it, and your
          rights regarding your data.
        </p>
      </section>

      <section>
        <h2>2. YouTube API Services</h2>
        <p>
          Music Hub uses
          <a href="https://developers.google.com/youtube/terms/api-services-terms-of-service" target="_blank" rel="noopener">YouTube API Services</a>.
          By using Music Hub, you acknowledge and agree that our use of YouTube data is also governed by the
          <a href="http://www.google.com/policies/privacy" target="_blank" rel="noopener">Google Privacy Policy</a>.
        </p>
      </section>

      <section>
        <h2>3. Information We Collect</h2>
        <p>We collect the following categories of information:</p>

        <h3>3.1 Account Information</h3>
        <p>
          When you create an account, we collect your username, email address, and a hashed
          version of your password. We never store passwords in plain text.
        </p>

        <h3>3.2 YouTube Data (via YouTube API Services)</h3>
        <p>
          When you connect your YouTube account, we access and store:
        </p>
        <ul>
          <li>YouTube OAuth access and refresh tokens (for authenticating API requests on your behalf)</li>
          <li>Your YouTube channel information (channel name, ID)</li>
          <li>Your YouTube playlists and playlist contents</li>
          <li>Video metadata (titles, thumbnails, durations) for display within the Service</li>
        </ul>
        <p>
          This data is retrieved through the YouTube Data API v3 and is used solely to provide
          YouTube-related features within Music Hub.
        </p>

        <h3>3.3 Spotify Data</h3>
        <p>
          When you connect your Spotify account, we access and store your Spotify OAuth access
          and refresh tokens, premium status, and playlist information to enable playback and
          playlist features.
        </p>

        <h3>3.4 User-Generated Content</h3>
        <p>
          We store posts, comments, messages, and other content you create within the Service.
        </p>

        <h3>3.5 Usage Data</h3>
        <p>
          We collect page view data and basic analytics to improve the Service.
        </p>
      </section>

      <section>
        <h2>4. Cookies and Local Storage</h2>
        <p>
          Music Hub stores, accesses, and collects information directly on your device using
          browser technologies including:
        </p>
        <ul>
          <li><strong>localStorage</strong> — We store your JSON Web Token (JWT) for authentication,
            media player state and position, playback preferences, and OAuth status flags</li>
          <li><strong>Cookies</strong> — Third-party services integrated into the Service (such as
            YouTube and Spotify embedded players) may place cookies on your device according to
            their own privacy policies</li>
        </ul>
      </section>

      <section>
        <h2>5. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul>
          <li>Provide and operate the Service, including user authentication and account management</li>
          <li>Display YouTube and Spotify content you request (playlists, videos, tracks)</li>
          <li>Enable social features such as posts, comments, likes, follows, and direct messages</li>
          <li>Send transactional emails (password resets, email verification)</li>
          <li>Moderate content and enforce our Terms of Use</li>
        </ul>
      </section>

      <section>
        <h2>6. How We Share Your Information</h2>
        <p>
          We do not sell your personal information. We share data only in the following circumstances:
        </p>
        <ul>
          <li><strong>Third-Party API Providers</strong> — We transmit OAuth tokens to YouTube
            (Google) and Spotify to authenticate API requests on your behalf. These providers
            process data according to their own privacy policies.</li>
          <li><strong>Public Content</strong> — Posts, comments, and profile information you choose
            to make public are visible to other users of the Service.</li>
          <li><strong>Legal Requirements</strong> — We may disclose information if required by law
            or legal process.</li>
        </ul>
      </section>

      <section>
        <h2>7. Data Deletion and Revoking Access</h2>
        <p>You can manage and delete your data in the following ways:</p>
        <ul>
          <li><strong>Delete Your Account</strong> — You can delete your account at any time through
            your Profile settings. This removes your account data, posts, and stored tokens from
            our database.</li>
          <li><strong>Disconnect YouTube</strong> — You can disconnect your YouTube account from
            within the Service, which removes your stored YouTube tokens.</li>
          <li><strong>Disconnect Spotify</strong> — You can disconnect your Spotify account from
            within the Service, which removes your stored Spotify tokens.</li>
          <li><strong>Revoke Google Access</strong> — You can revoke Music Hub's access to your
            Google/YouTube data at any time via the
            <a href="https://myaccount.google.com/connections?filters=3,4&hl=en" target="_blank" rel="noopener">Google security settings page</a>.</li>
        </ul>
      </section>

      <section>
        <h2>8. Data Security</h2>
        <p>
          We take reasonable measures to protect your data, including password hashing (bcrypt),
          JWT-based authentication, and secure HTTPS connections. However, no method of
          transmission or storage is 100% secure.
        </p>
      </section>

      <section>
        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify users of
          significant changes by updating the "Last Updated" date at the top of this page.
          Continued use of the Service after changes constitutes acceptance of the revised policy.
        </p>
      </section>

      <section>
        <h2>10. Contact Information</h2>
        <p>
          If you have questions or concerns about this Privacy Policy or your data, contact us at:
        </p>
        <p>
          <a href="mailto:itsmeabc411@gmail.com">itsmeabc411@gmail.com</a>
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.privacy-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.privacy-container h1 {
  font-size: 1.8rem;
  margin-bottom: 0.25rem;
}

.last-updated {
  color: #888;
  font-size: 0.9rem;
  margin-bottom: 2rem;
}

section {
  margin-bottom: 1.5rem;
}

section h2 {
  font-size: 1.15rem;
  margin-bottom: 0.5rem;
}

section h3 {
  font-size: 1rem;
  margin: 0.75rem 0 0.35rem;
}

section p,
section ul {
  line-height: 1.7;
  font-size: 0.95rem;
}

section ul {
  padding-left: 1.5rem;
}

section li {
  margin-bottom: 0.35rem;
}

a {
  color: pink;
  text-decoration: underline;
}
</style>
