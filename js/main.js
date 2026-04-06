// Get all the projects
$(document).ready(function () {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches && window.innerWidth <= 1024);

    document.body.classList.toggle('mobile-device', isMobileDevice);

    $.get('/project/get', function (data) {
        data.forEach(item => {
            $('#projects-menu').append(
                `<a class="dropdown-item" href="/project?id=${item.id}">${item.name}</a>`
            )
        })
    });

    $.get('/blog/get', function (data) {
        data.forEach(item => {
            $('#blog-menu').append(
                `<a class="dropdown-item" href="/blog?category=${item.category}">${item.category}</a>`
            )
        })
    });

    $('#em').html('<a href="mailto:admin@phg1024.net">admin@phg1024.net</a>');
});
