import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

interface StructuredDataProps {
  pageType?: 'home' | 'contact' | 'about' | 'services';
}

const StructuredData: React.FC<StructuredDataProps> = ({ pageType = 'home' }) => {
  const { language, t } = useLanguage();
  const businessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": "https://romerotechsolutions.com/",
    "name": "Romero Tech Solutions",
    "alternateName": "RTS",
    "description": "Professional IT support, computer repair, and network solutions serving San Diego County, CA with over 30 years of experience.",
    "url": "https://romerotechsolutions.com",
    "telephone": "+1-619-940-5550",
    "email": "info@romerotechsolutions.com",
    "priceRange": "$$",
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "IT Support Services",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Computer Repair & Maintenance",
            "description": "Professional computer diagnostics, hardware repairs, software troubleshooting, and system optimization."
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Network Setup & Configuration",
            "description": "Complete network setup, wireless configuration, security implementation, and connectivity solutions."
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Printer Setup & Support",
            "description": "Professional printer installation, configuration, troubleshooting, and ongoing maintenance support."
          }
        }
      ]
    },
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "US",
      "addressRegion": "CA",
      "addressLocality": "San Diego County",
      "postalCode": "92025"
    },
    "areaServed": [
      {
        "@type": "City",
        "name": "Escondido",
        "addressRegion": "CA"
      },
      {
        "@type": "City",
        "name": "Carlsbad",
        "addressRegion": "CA"
      },
      {
        "@type": "City",
        "name": "Oceanside",
        "addressRegion": "CA"
      },
      {
        "@type": "City",
        "name": "Vista",
        "addressRegion": "CA"
      },
      {
        "@type": "City",
        "name": "San Marcos",
        "addressRegion": "CA"
      },
      {
        "@type": "City",
        "name": "Encinitas",
        "addressRegion": "CA"
      },
      {
        "@type": "City",
        "name": "El Cajon",
        "addressRegion": "CA"
      },
      {
        "@type": "City",
        "name": "Poway",
        "addressRegion": "CA"
      }
    ],
    "openingHoursSpecification": [
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "opens": "08:00",
        "closes": "18:00",
        "description": "Standard Hours"
      },
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "opens": "18:00",
        "closes": "22:00",
        "description": "Premium Hours"
      },
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": "Saturday",
        "opens": "09:00",
        "closes": "22:00",
        "description": "Premium Hours"
      },
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": "Sunday",
        "opens": "00:00",
        "closes": "00:00",
        "description": "Emergency Calls Only"
      }
    ],
    "contactPoint": [
      {
        "@type": "ContactPoint",
        "telephone": "+1-619-940-5550",
        "contactType": "customer service",
        "availableLanguage": ["English", "Spanish"],
        "areaServed": "US-CA"
      },
      {
        "@type": "ContactPoint",
        "email": "info@romerotechsolutions.com",
        "contactType": "customer service",
        "availableLanguage": ["English", "Spanish"],
        "areaServed": "US-CA"
      }
    ],
    "sameAs": [
      "https://romerotechsolutions.com"
    ],
    "foundingDate": "1994",
    "founder": {
      "@type": "Person",
      "name": "Luis Romero",
      "jobTitle": "Founder & Lead Technician",
      "description": "30+ years experience in IT support, cyber security, and enterprise systems. Former Air Force Communications and Army Cyber Security specialist."
    },
    "employee": {
      "@type": "Person",
      "name": "Luis Romero",
      "jobTitle": "Lead Technician & Founder"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "5.0",
      "reviewCount": "2",
      "bestRating": "5",
      "worstRating": "1"
    },
    "review": [
      {
        "@type": "Review",
        "author": {
          "@type": "Person",
          "name": "Maria S."
        },
        "reviewRating": {
          "@type": "Rating",
          "ratingValue": "5",
          "bestRating": "5",
          "worstRating": "1"
        },
        "reviewBody": language === 'es'
          ? "¡Romero Tech Solutions salvó mi negocio! Cuando nuestra red se cayó, nos pusieron en línea nuevamente en 2 horas. Profesional, rápido y con precios razonables."
          : "Romero Tech Solutions saved my business! When our network went down, they had us back online in 2 hours. Professional, fast, and reasonably priced.",
        "datePublished": "2025-01-15",
        "inLanguage": language === 'es' ? 'es-US' : 'en-US'
      },
      {
        "@type": "Review",
        "author": {
          "@type": "Person",
          "name": "Carlos R."
        },
        "reviewRating": {
          "@type": "Rating",
          "ratingValue": "5",
          "bestRating": "5",
          "worstRating": "1"
        },
        "reviewBody": language === 'es'
          ? "Excelente servicio bilingüe. Luis me ayudó a configurar mi red doméstica y explicó todo en español. Muy profesional y conocedor."
          : "Excellent bilingual service. Luis helped me set up my home network and explained everything in Spanish. Very professional and knowledgeable.",
        "datePublished": "2025-01-20",
        "inLanguage": language === 'es' ? 'es-US' : 'en-US'
      }
    ],
    "logo": {
      "@type": "ImageObject",
      "url": "https://romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png",
      "width": "1024",
      "height": "1024"
    },
    "image": {
      "@type": "ImageObject",
      "url": "https://romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png",
      "width": "1024",
      "height": "1024"
    },
    "hasCredential": [
      {
        "@type": "EducationalOccupationalCredential",
        "credentialCategory": "Military Training",
        "recognizedBy": {
          "@type": "Organization",
          "name": "United States Air Force"
        },
        "about": "Communications Computer Systems Operator"
      },
      {
        "@type": "EducationalOccupationalCredential",
        "credentialCategory": "Military Training",
        "recognizedBy": {
          "@type": "Organization",
          "name": "United States Army"
        },
        "about": "Cyber Security Specialist"
      }
    ],
    "knowsAbout": [
      "Computer Repair",
      "Network Configuration",
      "IT Support",
      "Cyber Security",
      "Printer Setup",
      "System Optimization",
      "Enterprise Systems",
      "Fortune 500 Support"
    ],
    "award": [
      "30+ Years IT Experience",
      "Fortune 500 Company Experience",
      "Military Cyber Security Training"
    ]
  };

  // Organization schema for enhanced business recognition
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://romerotechsolutions.com/#organization",
    "name": "Romero Tech Solutions",
    "url": "https://romerotechsolutions.com",
    "logo": "https://romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png",
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": "+1-619-940-5550",
      "contactType": "customer support",
      "availableLanguage": ["English", "Spanish"]
    },
    "address": {
      "@type": "PostalAddress",
      "addressRegion": "CA",
      "addressCountry": "US",
      "addressLocality": "San Diego County"
    },
    "sameAs": [
      "https://romerotechsolutions.com"
    ]
  };

  // WebSite schema for enhanced search features
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://romerotechsolutions.com/#website",
    "url": "https://romerotechsolutions.com",
    "name": "Romero Tech Solutions - Professional IT Support San Diego County",
    "description": "Expert computer repair, network setup, and IT support for homes and businesses throughout San Diego County, CA with over 30 years of experience.",
    "publisher": {
      "@id": "https://romerotechsolutions.com/#organization"
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://romerotechsolutions.com/?s={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    },
    "inLanguage": ["en-US", "es-US"]
  };

  // FAQPage schema (bilingual based on current language)
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "inLanguage": language === 'es' ? 'es-US' : 'en-US',
    "mainEntity": [
      {
        "@type": "Question",
        "name": t('faq.q1' as any),
        "acceptedAnswer": {
          "@type": "Answer",
          "text": t('faq.a1' as any)
        }
      },
      {
        "@type": "Question",
        "name": t('faq.q2' as any),
        "acceptedAnswer": {
          "@type": "Answer",
          "text": t('faq.a2' as any)
        }
      },
      {
        "@type": "Question",
        "name": t('faq.q3' as any),
        "acceptedAnswer": {
          "@type": "Answer",
          "text": t('faq.a3' as any)
        }
      },
      {
        "@type": "Question",
        "name": t('faq.q4' as any),
        "acceptedAnswer": {
          "@type": "Answer",
          "text": t('faq.a4' as any)
        }
      },
      {
        "@type": "Question",
        "name": t('faq.q5' as any),
        "acceptedAnswer": {
          "@type": "Answer",
          "text": t('faq.a5' as any)
        }
      },
      {
        "@type": "Question",
        "name": t('faq.q6' as any),
        "acceptedAnswer": {
          "@type": "Answer",
          "text": t('faq.a6' as any)
        }
      }
    ]
  };

  // BreadcrumbList schema for navigation
  const getBreadcrumbSchema = () => {
    const breadcrumbItems = [
      {
        "@type": "ListItem",
        "position": 1,
        "name": language === 'es' ? 'Inicio' : 'Home',
        "item": "https://romerotechsolutions.com/"
      }
    ];

    // Add current page to breadcrumb if not home
    if (pageType !== 'home') {
      const pageNames = {
        services: language === 'es' ? 'Servicios' : 'Services',
        about: language === 'es' ? 'Acerca de' : 'About',
        contact: language === 'es' ? 'Contacto' : 'Contact'
      };

      breadcrumbItems.push({
        "@type": "ListItem",
        "position": 2,
        "name": pageNames[pageType as keyof typeof pageNames] || pageType,
        "item": `https://romerotechsolutions.com/${pageType}`
      });
    }

    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": breadcrumbItems
    };
  };

  const breadcrumbSchema = getBreadcrumbSchema();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(businessSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  );
};

export default StructuredData;