#1
• Client system sends inbound data to Darwinbox via API-based integration
• Data is authenticated and validated using standard security protocols
• Darwinbox processes and stores the data in the specified module
• Confirmation response is sent back to client system

#2
• Employee data flows from HRIS to Darwinbox through secure API endpoints
• Authentication occurs using OAuth 2.0 before data processing begins
• Darwinbox validates and transforms data according to business rules
• Success or error notifications are returned to the source system

#3
• Attendance punches are pushed from client system to Darwinbox APIs
• System validates employee IDs and punch timestamps before processing
• Data is stored in Attendance module with appropriate business logic
• Real-time confirmation is provided to the originating system

#4
• Integration utilizes REST API endpoints with secure authentication protocols
• Data validation and transformation processes maintain data integrity
• Business rules are applied during processing to ensure compliance
• Automated error handling and logging provide operational visibility

#5
• Payroll data synchronizes from external system to Darwinbox platform
• Secure API authentication ensures authorized access to sensitive information
• Data transformation and validation occur before storage in Payroll module
• System provides immediate feedback on processing status and any errors

#6
Overview
The objective of this integration is to establish a seamless Recruitment to Core (Pending list) integration. It streamlines the process of automatically adding employees whose status is
“Offer Accepted and to be added to pending list” (only those cases for which the offer letter and flow was generated from Darwinbox) into the pending list.
For this integration, the python script will be developed by Darwinbox Integration team. The script will identify candidates with an "Offer Accepted and to be added to pending list"(only
those cases for which the offer letter and flow was generated from Darwinbox) status, and automatically add them in a pending state thrice a day.
Additionally, this integration will provide the client with logs detailing both successes and failures.
Scheduling
The python Script will execute thrice a day, automatically adding candidates with an "Offer Accepted and to be added to pending list"(only those cases for which the offer letter and
flow was generated from Darwinbox) status to the pending state.

#7
Overview
This integration aims to be an On Premises AD sync employee master integration: it extracts employees’ master data (Active) and
synchronizes it with the On Premises AD Active Directory.
Data is extracted from the Darwinbox System, where the Master Data resides. The data for the existing employees is extracted.
The mapping is according to the table depicted above.
The R script will be developed by the Darwinbox Integration team and positioned on the Darwinbox Studio.
Sync Account Permissions

1. Read and Write Access task scheduler user to run the Powershell script.
   No other data from the Windows Server will be accessed by the script.
   Point of Attention: A random password will be accorded to the users by the script which the users will have to change at the next
   logon. The password can then be reset by the Admin/HR on request.
   User On Premises AD Activation -
   To Add Group for New userDB Response
   Group - Captured on Onboarding form/logic provided by customer
   based on organizational attributes assignment.This needs to be created as
   checkbox in the Onboarding
   form
   User On Premises AD Deactivation -
   Note: The mail of the employee should not be tampered with as it would act as the reference attribute for the employee update.

#8
Overview
This integration aims to be an Open Air sync employee master integration: it extracts employees’ master data (Active) and
synchronizes it with the Azure Active Directory. Additionally, based on Open Air Timesheet data, leaves will be deducted/markedin Darwinbox.
Data is extracted from the Darwinbox System, where the Master Data resides. The data for the existing employees is extracted.
The mapping is according to the table depicted above.
The Python script will be developed by the Darwinbox Integration team and positioned on the Darwinbox Integration Platform.
Sync Account Permissions
The following points contain the data access permissions needed by the custom application (as mentioned by Open Air) using
which we will consume graph APIs for the Integration
API endpoint and Token based authentication details for Creating/Changing/Deactivating users on Open Air
Ensuring functional structure matched between DB and Open Air.
Point of Attention: A random password will be accorded to the users by the script which the users will have to change at the next
logon. The password can then be reset by the Admin/HR on request. This will be sent to the user’s official mail ID.
