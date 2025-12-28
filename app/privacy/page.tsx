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
            
            <h3 className="font-medium mt-4 mb-2">3.1 Spotify API Data</h3>
            <p className="text-muted-foreground mb-2">
              When you sign in with Spotify, we access the following data through the Spotify Web API:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Your Spotify display name and profile information</li>
              <li>Your playlists (names, tracks, metadata)</li>
              <li>Your Liked Songs library</li>
              <li>Playback control for track previews</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              <strong>Important:</strong> Your playlist data is fetched directly from Spotify and is not stored 
              on our servers. All playlist modifications are made directly through the Spotify API.
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
              tokens that allow us to make authorized requests to Spotify on your behalf. We do not store 
              your Spotify password.
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
              <li>Preview tracks through Spotify&apos;s player</li>
              <li>Remember your UI preferences</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">5. Data Sharing</h2>
            <p className="text-muted-foreground">
              We do not sell, trade, or share your personal data with third parties. Your data is only 
              transmitted to Spotify to perform the actions you request (e.g., moving tracks, updating playlists).
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">6. Data Retention</h2>
            <p className="text-muted-foreground">
              We do not store your Spotify data on our servers. Session data is temporary and is deleted 
              when you log out or your session expires. Local storage data remains in your browser until 
              you clear it.
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
            <h2 className="text-lg font-semibold mb-2">8. Spotify&apos;s Privacy Policy</h2>
            <p className="text-muted-foreground">
              This application uses the Spotify Web API. Please also review{" "}
              <a 
                href="https://www.spotify.com/legal/privacy-policy/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
              >
                Spotify&apos;s Privacy Policy
              </a>{" "}
              to understand how Spotify handles your data.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">9. Revoking Access</h2>
            <p className="text-muted-foreground">
              You can revoke this application&apos;s access to your Spotify account at any time by visiting{" "}
              <a 
                href="https://www.spotify.com/account/apps/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
              >
                your Spotify account settings
              </a>.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">10. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this privacy policy from time to time. We will notify you of any significant 
              changes by posting the new policy on this page.
            </p>
            <p className="text-muted-foreground mt-2">
              Last updated: December 2024
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
