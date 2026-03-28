import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getContactInfo } from "@/lib/contact";

export const metadata = {
  title: "Privacy Policy | Listmagify",
  description: "Privacy policy and data protection information for Listmagify",
};

/**
 * Privacy Policy page - GDPR-compliant privacy information
 */
export default function PrivacyPage() {
  const contact = getContactInfo();

  return (
    <div className="min-h-dvh bg-background">
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
        
        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
        
        <section className="space-y-8 text-sm">
          <div>
            <h2 className="text-lg font-semibold mb-2">1. Overview</h2>
            <p className="text-muted-foreground">
              This privacy policy explains how Listmagify handles your data. We are committed to protecting 
              your privacy and being transparent about our data practices.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">2. Data Controller</h2>
            <p className="text-muted-foreground">
              The data controller responsible for this website is:<br />
              {contact.name}<br />
              <a href={`mailto:${contact.email}`} className="hover:text-foreground">{contact.email}</a>
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">3. Data We Process</h2>
            
            <h3 className="font-medium mt-4 mb-2">3.1 Music Provider Data (Spotify &amp; TIDAL)</h3>
            <p className="text-muted-foreground mb-2">
              When you sign in with Spotify or TIDAL, we access the following data through their APIs:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Your display name and profile information</li>
              <li>Your playlists (names, tracks, metadata)</li>
              <li>Your Liked Songs / Favorites library</li>
              <li>Playback control for track previews (Spotify)</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Your playlist data is fetched directly from each provider and is not permanently stored
              on our servers. All playlist modifications are made directly through the provider APIs.
            </p>

            <h3 className="font-medium mt-4 mb-2">3.2 Local Browser Storage</h3>
            <p className="text-muted-foreground mb-2">
              We use your browser&apos;s local storage to save:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>UI preferences (compact mode, panel states)</li>
              <li>Split editor layout configuration</li>
              <li>Recent playlist selections</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              This data never leaves your browser and can be cleared by clearing your browser data.
            </p>

            <h3 className="font-medium mt-4 mb-2">3.3 Authentication Data</h3>
            <p className="text-muted-foreground">
              We use secure HTTP-only cookies to maintain your session. These cookies contain encrypted
              tokens that allow us to make authorized requests to Spotify and TIDAL on your behalf. We do not store
              your passwords.
            </p>

            <h3 className="font-medium mt-4 mb-2">3.4 Server-Side Token Storage (Background Sync)</h3>
            <p className="text-muted-foreground mb-2">
              If you enable playlist synchronization between providers, we store encrypted OAuth tokens
              (access tokens and refresh tokens) on the server to enable background sync when you are
              not actively using the application.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Tokens are encrypted using AES-256-GCM before storage</li>
              <li>Tokens are used exclusively to sync your playlists between providers</li>
              <li>Tokens are deleted immediately when you disconnect a provider</li>
              <li>You can disable background sync at any time, which stops token usage</li>
              <li>Stored tokens grant limited access (playlist management only, per the scopes you authorized)</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              This server-side storage is necessary because OAuth tokens expire regularly and must be
              refreshed to maintain continuous sync. Without stored tokens, sync would only work while
              you have the application open in your browser.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">4. How We Use Your Data</h2>
            <p className="text-muted-foreground">
              We use your data solely to provide the playlist management functionality:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2 mt-2">
              <li>Display and organize your playlists</li>
              <li>Enable drag-and-drop track management</li>
              <li>Synchronize playlists between Spotify and TIDAL</li>
              <li>Preview tracks through Spotify&apos;s player</li>
              <li>Match and resolve tracks across providers</li>
              <li>Remember your UI preferences</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">5. Data Sharing</h2>
            <p className="text-muted-foreground">
              We do not sell, trade, or share your personal data with third parties. Your data is only
              transmitted to Spotify and TIDAL to perform the actions you request (e.g., moving tracks,
              updating playlists, syncing between providers).
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">6. Data Retention</h2>
            <p className="text-muted-foreground mb-2">
              We do not permanently store your playlist content on our servers. Session data is temporary and
              is deleted when you log out or your session expires. Local storage data remains in your browser
              until you clear it.
            </p>
            <p className="text-muted-foreground">
              <strong>Encrypted tokens</strong> stored for background sync (see section 3.4) are retained
              as long as the sync feature is enabled and deleted immediately when you disconnect a
              provider or delete a sync pair. You can request deletion of all stored tokens by contacting us.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">7. Your Rights (GDPR)</h2>
            <p className="text-muted-foreground mb-2">
              Under the General Data Protection Regulation, you have the right to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Access – request a copy of your data</li>
              <li>Rectification – request correction of inaccurate data</li>
              <li>Erasure – request deletion of your data</li>
              <li>Restriction – request limited processing of your data</li>
              <li>Portability – receive your data in a portable format</li>
              <li>Object – object to processing of your data</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              To exercise these rights, contact us at{" "}
              <a href={`mailto:${contact.email}`} className="hover:text-foreground">{contact.email}</a>.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">8. Provider Privacy Policies</h2>
            <p className="text-muted-foreground mb-2">
              This application uses the Spotify Web API and TIDAL API. Please also review their privacy policies:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>
                <a
                  href="https://www.spotify.com/legal/privacy-policy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground underline"
                >
                  Spotify&apos;s Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="https://tidal.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground underline"
                >
                  TIDAL&apos;s Privacy Policy
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">9. Revoking Access</h2>
            <p className="text-muted-foreground mb-2">
              You can revoke this application&apos;s access at any time:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>
                <strong>Spotify:</strong>{" "}
                <a
                  href="https://www.spotify.com/account/apps/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground underline"
                >
                  Spotify account settings
                </a>
              </li>
              <li>
                <strong>TIDAL:</strong> Visit your TIDAL account settings to manage connected applications
              </li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Revoking access will immediately invalidate all stored tokens and stop any active background sync.
              You can also disconnect a provider within Listmagify, which deletes stored tokens from our servers.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">10. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this privacy policy from time to time. We will notify you of any significant 
              changes by posting the new policy on this page.
            </p>
            <p className="text-muted-foreground mt-2">
              Last updated: March 2026
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">11. Contact</h2>
            <p className="text-muted-foreground">
              If you have any questions about this privacy policy, please contact us at:<br />
              <a href={`mailto:${contact.email}`} className="hover:text-foreground">{contact.email}</a>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
