import ContactForm from "@/components/contact/ContactForm";

type ContactPageProps = {
  searchParams: Promise<{ plan?: string }>;
};

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const { plan } = await searchParams;

  return <ContactForm defaultPlanTier={plan} />;
}
