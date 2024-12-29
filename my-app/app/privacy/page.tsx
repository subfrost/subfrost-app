import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function PrivacyPolicy() {
  return (
    <Card className="frost-bg frost-border max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="retro-text text-blue-600">Privacy Policy</CardTitle>
      </CardHeader>
      <CardContent className="readable-text text-sm space-y-4">
        <p>
          Your privacy is important to us. It is Subzero Research Inc's policy to respect your privacy regarding any information we may collect from you across our website, SUBFROST, and other sites we own and operate.
        </p>
        <h2 className="retro-text text-blue-500 text-lg">1. Information We Collect</h2>
        <p>
          We only ask for personal information when we truly need it to provide a service to you. We collect it by fair and lawful means, with your knowledge and consent. We also let you know why we're collecting it and how it will be used.
        </p>
        <h2 className="retro-text text-blue-500 text-lg">2. Use of Information</h2>
        <p>
          We only retain collected information for as long as necessary to provide you with your requested service. What data we store, we'll protect within commercially acceptable means to prevent loss and theft, as well as unauthorized access, disclosure, copying, use or modification.
        </p>
        <h2 className="retro-text text-blue-500 text-lg">3. Data Sharing</h2>
        <p>
          We don't share any personally identifying information publicly or with third-parties, except when required to by law.
        </p>
        <h2 className="retro-text text-blue-500 text-lg">4. External Links</h2>
        <p>
          Our website may link to external sites that are not operated by us. Please be aware that we have no control over the content and practices of these sites, and cannot accept responsibility or liability for their respective privacy policies.
        </p>
        <h2 className="retro-text text-blue-500 text-lg">5. Changes to This Policy</h2>
        <p>
          At our discretion, we may change our privacy policy to reflect current acceptable practices. We will take reasonable steps to let users know about changes via our website. Your continued use of this site after any changes to this policy will be regarded as acceptance of our practices around privacy and personal information.
        </p>
        <h2 className="retro-text text-blue-500 text-lg">6. Your Rights</h2>
        <p>
          If you have any questions or concerns about our privacy practices, your personal information, or if you want to make a complaint, please contact us using the details provided on our website.
        </p>
      </CardContent>
    </Card>
  )
}

