import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function TermsOfService() {
  return (
    <Card className="frost-bg frost-border max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="retro-text text-blue-600">Terms of Service</CardTitle>
      </CardHeader>
      <CardContent className="readable-text text-sm space-y-4">
        <p>
          Welcome to SUBFROST. By using our service, you agree to be bound by the following terms and conditions:
        </p>
        <h2 className="retro-text text-blue-500 text-lg">1. Acceptance of Terms</h2>
        <p>
          By accessing or using SUBFROST, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any part of these terms, you may not use our service.
        </p>
        <h2 className="retro-text text-blue-500 text-lg">2. Limitation of Liability</h2>
        <p>
          Subzero Research Inc, its directors, employees, partners, agents, suppliers, or affiliates, shall not be liable for any loss or damage, direct or indirect, incidental, special, consequential or punitive damages, including without limitation, economic loss, loss or damage to electronic media or data, goodwill, or other intangible losses, resulting from (i) your access to or use of the service; (ii) your inability to access or use the service; (iii) any conduct or content of any third party on the service; (iv) any content obtained from the service; and (v) unauthorized access, use or alteration of your transmissions or content, whether based on warranty, contract, tort (including negligence) or any other legal theory, whether or not we have been informed of the possibility of such damage, and even if a remedy set forth herein is found to have failed of its essential purpose.
        </p>
        <h2 className="retro-text text-blue-500 text-lg">3. Disclaimer</h2>
        <p>
          Your use of the service is at your sole risk. The service is provided on an "AS IS" and "AS AVAILABLE" basis. The service is provided without warranties of any kind, whether express or implied, including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, non-infringement or course of performance.
        </p>
        <h2 className="retro-text text-blue-500 text-lg">4. Governing Law</h2>
        <p>
          These Terms shall be governed and construed in accordance with the laws of [Your Jurisdiction], without regard to its conflict of law provisions.
        </p>
        <p>
          Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights. If any provision of these Terms is held to be invalid or unenforceable by a court, the remaining provisions of these Terms will remain in effect.
        </p>
      </CardContent>
    </Card>
  )
}

