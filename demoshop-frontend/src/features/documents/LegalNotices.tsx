import React from 'react';

export const LegalNotices = () => {
  return (
    <div className="min-h-screen bg-charcoal pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute inset-0 bg-texture opacity-50 pointer-events-none"></div>
      
      <div className="max-w-4xl mx-auto relative z-10">
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-ivory mb-8">Privacy Policy</h1>
        <p className="text-gold font-serif italic mb-12">Effective Date: October 24, 2024</p>

        <div className="space-y-12 text-ivory-dim font-light leading-relaxed">
          <section>
            <h2 className="text-2xl font-serif font-bold text-ivory mb-4">1. Information We Collect</h2>
            <p className="mb-4">
              We collect information necessary to provide our grooming services and improve your experience:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Personal Identification (Name, Email, Phone Number)</li>
              <li>Booking History and Preferences</li>
              <li>Payment Information (processed securely by third-party providers)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-serif font-bold text-ivory mb-4">2. How We Use Your Data</h2>
            <p>
              Your data is used solely for:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Managing appointments and reminders.</li>
              <li>Personalizing your service preferences.</li>
              <li>Sending promotional offers (only if you opt-in).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-serif font-bold text-ivory mb-4">3. Data Protection</h2>
            <p>
              We implement industry-standard security measures to protect your personal information. We do not sell or trade your data to outside parties.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-serif font-bold text-ivory mb-4">4. Your Rights</h2>
            <p>
              You have the right to access, correct, or delete your personal data at any time. Contact us at portfolio@example.invalid for assistance.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
