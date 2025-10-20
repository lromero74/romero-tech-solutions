Final recommendation from AI:
For a new, interactive application with user logins and a database, you should seriously consider the serverless approach using a combination of AWS Amplify, API Gateway, and Lambda, while keeping your RDS database. This architecture is a more modern, scalable, and cost-efficient solution compared to manually managing an EC2 instance. It allows you to focus on developing your application's features rather than worrying about server management. 

My own notes:
GOAL
Enterprise class MSP interface for clients, technicians, and admins to manage businesses, clients, users, admins, technicians, service requests, service offerings, tasks, projects, schedules, reporting, communications, and invoicing 

Things to keep in mind:
1) production deployment will be serverless
2) will leverage API gateway, Lambda, and RDS where available
3) will strive to keep source file sizes managable and break out modules and submodules where necessary
4) will maintain clean logical directory structure
5) will maintain consistency in interface style and design
6) will ensure all pages have appropriate L10N
7) will continue to analyise structure to identify redundant or orphaned code and seek opportunity to maintain proper code footprint.

Sec/Role stuff to keep in mind:
1) Clients can only see their own tasks, messages, scheduled service requests, invoices, etc.  Only things that pertain to the client
2) Technicians can only see their own assigned service requests, schedules. 
3) Admins can see all clients, service requests, invoices, technician schedules, etc. 
4) Admins shall be able to assign service requests to a technician (such assignment will also result in e-mail and/or text to technician with information on assigned request, and option to e-mail and/or text client contact on service request that the request is assigned.
5) Technicians shall not be able to mark themselves out on vacation or sick (admins must mark this)
6) Technicians shall be able to see service requests that are unassigned and take assignment
7) Clients shall be able to see general schedule availability (but not technician names).  Greyed out time slots to indicate no availability.

ToDo:
1) Let's implement a /sales page to for sales people to log in
2) Sales people shall be able to see add businesses and client contacts to the database
3) Sales people shall be able to modify business and client contact information
4) Sales people shall be able to help client reset/manage their own credentials
5) Sales people shall be able to see, print, and e-mail clients their invoices
6) Sales people shall be able to create but not delete invoices
7) Technicians, Admins, Sales, shall be considered roles that are assignable to internal users (not clients, but employees so maintain an employee database and a roles table)
8) Internal users may be assigned multiple roles by Admins
9) Admins shall have all roles available by default but can be opted out of other roles individually
10) make sure blue field for partle effects and mouse lick to generate effects is correct for pages that support it
11) Login via /admin /technician /sales requires <user>@romerotechsolutions.com e-mail address


