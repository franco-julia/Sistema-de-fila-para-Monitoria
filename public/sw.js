self.addEventListener('push', e => {
    const data = e.data.json();
    self.registration.showNotification(data.title, {
        body: data.body,
        icon: 'https://versa-reda-o-773387511416.us-west1.run.app/favicon.ico'
    });
});