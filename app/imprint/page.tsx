import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getContactInfo } from "@/lib/contact";

export const metadata = {
  title: "Imprint | Listmagify",
  description: "Legal information and contact details for Listmagify",
};

/**
 * Imprint page - EU-compliant legal disclosure (Impressum)
 */
export default function ImprintPage() {
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
        
        <h1 className="text-3xl font-bold mb-8">Imprint</h1>
        
        <section className="space-y-6 text-sm">
          <div>
            <h2 className="text-lg font-semibold mb-2">Information according to § 5 TMG</h2>
            <address className="not-italic text-muted-foreground">
              <p>{contact.name}</p>
              <p>{contact.street}</p>
              <p>{contact.postalCode} {contact.city}</p>
              <p>{contact.country}</p>
            </address>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Contact</h2>
            <p className="text-muted-foreground">
              Email: <a href={`mailto:${contact.email}`} className="hover:text-foreground">{contact.email}</a>
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Responsible for content according to § 55 Abs. 2 RStV</h2>
            <p className="text-muted-foreground">{contact.name}</p>
            <p className="text-muted-foreground">(Address as above)</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">EU Dispute Resolution</h2>
            <p className="text-muted-foreground">
              The European Commission provides a platform for online dispute resolution (ODR):{" "}
              <a 
                href="https://ec.europa.eu/consumers/odr/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
              >
                https://ec.europa.eu/consumers/odr/
              </a>
            </p>
            <p className="text-muted-foreground mt-2">
              We are not willing or obliged to participate in dispute resolution proceedings before a consumer arbitration board.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Liability for Content</h2>
            <p className="text-muted-foreground">
              As a service provider, we are responsible for our own content on these pages according to § 7 Abs.1 TMG. 
              According to §§ 8 to 10 TMG, however, we are not obligated as a service provider to monitor transmitted 
              or stored third-party information or to investigate circumstances that indicate illegal activity.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Liability for Links</h2>
            <p className="text-muted-foreground">
              Our website contains links to external third-party websites over whose content we have no influence. 
              Therefore, we cannot assume any liability for these external contents. The respective provider or 
              operator of the pages is always responsible for the content of the linked pages.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
