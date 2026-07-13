import Contacts
import Foundation

struct ContactSyncService {
    let client: DeviceSyncClient

    func syncSelectedContacts() async throws {
        let store = CNContactStore()
        guard try await store.requestAccess(for: .contacts) else { throw ContactSyncError.permissionDenied }
        let keys: [CNKeyDescriptor] = [CNContactIdentifierKey as CNKeyDescriptor, CNContactGivenNameKey as CNKeyDescriptor, CNContactFamilyNameKey as CNKeyDescriptor, CNContactPhoneNumbersKey as CNKeyDescriptor, CNContactEmailAddressesKey as CNKeyDescriptor, CNContactOrganizationNameKey as CNKeyDescriptor, CNContactJobTitleKey as CNKeyDescriptor]
        let request = CNContactFetchRequest(keysToFetch: keys)
        var contacts: [[String: Any]] = []
        try store.enumerateContacts(with: request) { contact, stop in
            contacts.append([
                "externalId": contact.identifier,
                "name": "\(contact.familyName)\(contact.givenName)",
                "phone": contact.phoneNumbers.first?.value.stringValue ?? "",
                "email": contact.emailAddresses.first.map { String($0.value) } ?? "",
                "companyName": contact.organizationName,
                "position": contact.jobTitle
            ])
            if contacts.count >= 500 { stop.pointee = true }
        }
        try await client.upload(contacts: contacts)
    }
}

enum ContactSyncError: Error { case permissionDenied }
